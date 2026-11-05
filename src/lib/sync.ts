import { CLOUD_SYNC } from "./config";
import { db, setKv, type OutboxEntry, type SyncedTable } from "./db";
import { blobToDataUrl } from "./files";
import { getSupabase } from "./supabase";

/**
 * Sincronización local-first. La app lee y escribe siempre IndexedDB; acá se reconcilia
 * con Supabase en dos pasos:
 *   flush: sube el outbox (una entrada por fila modificada).
 *   pull:  trae todo lo del usuario y reemplaza las filas locales sin cambios pendientes.
 * Con un solo usuario por cuenta alcanza con "gana la última escritura".
 */

const PK_SEPARATOR = "|";

const PRIMARY_KEYS: Record<SyncedTable, string[]> = {
  professionals: ["id"],
  oficios: ["id"],
  professional_oficios: ["professional_id", "oficio_id"],
  clients: ["id"],
  budgets: ["id"],
  budget_items: ["id"],
  jobs: ["id"],
  job_photos: ["id"],
  budget_pdfs: ["id"],
};

// Orden que respeta las FK: los upserts van en este orden y los deletes al revés.
const TABLE_ORDER: SyncedTable[] = [
  "professionals",
  "oficios",
  "professional_oficios",
  "clients",
  "budgets",
  "budget_items",
  "jobs",
  "job_photos",
  "budget_pdfs",
];

export function rowPk(table: SyncedTable, row: Record<string, unknown>): string {
  return PRIMARY_KEYS[table].map((column) => String(row[column])).join(PK_SEPARATOR);
}

function pkMatch(table: SyncedTable, pk: string): Record<string, string> {
  const values = pk.split(PK_SEPARATOR);
  return Object.fromEntries(PRIMARY_KEYS[table].map((column, index) => [column, values[index]]));
}

function localKey(table: SyncedTable, pk: string): string | string[] {
  const values = pk.split(PK_SEPARATOR);
  return values.length === 1 ? values[0] : values;
}

/** Registra un cambio. Llamar dentro de una transacción de escritura que incluya outbox. */
export async function markDirty(
  table: SyncedTable,
  pk: string,
  op: OutboxEntry["op"],
  removeFile?: string,
) {
  // Mientras no haya nube, no se encola nada.
  if (!CLOUD_SYNC) return;
  const key = `${table}:${pk}`;
  const existing = await db.outbox.get(key);
  await db.outbox.put({
    key,
    table,
    pk,
    op,
    rev: (existing?.rev ?? 0) + 1,
    removeFile: removeFile ?? existing?.removeFile,
  });
}

/** Sin red o servidor caído: se reintenta después. Lo demás no se arregla reintentando. */
function isTransient(status: number | undefined): boolean {
  return status === undefined || status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

class TransientError extends Error {}

function throwIfError(error: { message: string } | null, status: number | undefined) {
  if (!error) return;
  if (isTransient(status)) throw new TransientError(error.message);
  throw new Error(error.message);
}

function storageStatus(error: unknown): number | undefined {
  const raw = (error as { statusCode?: string | number; status?: number }).statusCode ?? (error as { status?: number }).status;
  return raw === undefined ? undefined : Number(raw);
}

async function flushEntry(entry: OutboxEntry) {
  const supabase = getSupabase();
  const { table, pk } = entry;

  if (entry.op === "delete") {
    if (entry.removeFile) {
      const bucket = table === "budget_pdfs" ? "pdfs" : "job-photos";
      const { error } = await supabase.storage.from(bucket).remove([entry.removeFile]);
      if (error) throwIfError(error, storageStatus(error));
    }
    const { error, status } = await supabase.from(table).delete().match(pkMatch(table, pk));
    throwIfError(error, status);
    return;
  }

  const dexieTable = db.table(table);
  const row = (await dexieTable.get(localKey(table, pk))) as Record<string, unknown> | undefined;
  if (!row) return; // Se borró localmente antes de llegar a subirse.

  const pending = await db.blobs.get(pk);
  if (pending) {
    const { error } = await supabase.storage
      .from(pending.bucket)
      .upload(pending.path, pending.blob, { upsert: true, contentType: pending.blob.type });
    if (error) throwIfError(error, storageStatus(error));
  }

  const payload = { ...row };
  // Sin clave, la columna no viaja y el trigger del servidor asigna el correlativo.
  if (table === "budgets" && payload.number === null) delete payload.number;

  const { data, error, status } = await supabase
    .from(table)
    .upsert(payload, { onConflict: PRIMARY_KEYS[table].join(",") })
    .select();
  throwIfError(error, status);

  if (table === "budgets" && payload.number === undefined) {
    const assigned = (data as { number: number }[] | null)?.[0]?.number;
    if (assigned !== undefined) await db.budgets.update(String(row.id), { number: assigned });
  }
  if (pending) await db.blobs.delete(pk);
}

/** Sube lo pendiente. Se corta ante un error transitorio y conserva el orden. */
async function flush() {
  const entries = (await db.outbox.toArray()).filter((entry) => !entry.error);
  const order = (entry: OutboxEntry) => {
    const position = TABLE_ORDER.indexOf(entry.table);
    return entry.op === "upsert" ? position : TABLE_ORDER.length + (TABLE_ORDER.length - position);
  };
  entries.sort((a, b) => order(a) - order(b));

  for (const entry of entries) {
    try {
      await flushEntry(entry);
      await db.transaction("rw", db.outbox, async () => {
        // Si se editó mientras subía, la entrada queda para la próxima vuelta.
        const current = await db.outbox.get(entry.key);
        if (current?.rev === entry.rev) await db.outbox.delete(entry.key);
      });
    } catch (error) {
      if (error instanceof TransientError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/fetch|network/i.test(message)) throw new TransientError(message);
      // Rechazo definitivo (validación, RLS): se aparta para no trabar el resto de la cola.
      await db.outbox.update(entry.key, { error: message });
    }
  }
}

const PAGE_SIZE = 1000;

async function fetchAll(table: SyncedTable): Promise<Record<string, unknown>[]> {
  const orderColumn = PRIMARY_KEYS[table][0];
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error, status } = await getSupabase()
      .from(table)
      .select("*")
      .order(orderColumn)
      .range(from, from + PAGE_SIZE - 1);
    throwIfError(error, status);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** PostgREST devuelve numeric como number; solo hay que sacar la columna interna. */
function fromRemote(table: SyncedTable, row: Record<string, unknown>) {
  if (table === "professionals") {
    const rest = { ...row };
    delete rest.last_budget_number;
    return rest;
  }
  return row;
}

async function pull() {
  const remote = await Promise.all(TABLE_ORDER.map((table) => fetchAll(table)));

  await db.transaction("rw", [...TABLE_ORDER.map((table) => db.table(table)), db.outbox], async () => {
    const pending = await db.outbox.toArray();
    for (const [index, table] of TABLE_ORDER.entries()) {
      const dirty = new Set(pending.filter((entry) => entry.table === table).map((entry) => entry.pk));
      const dexieTable = db.table(table);
      const rows = remote[index].map((row) => fromRemote(table, row));
      const remotePks = new Set(rows.map((row) => rowPk(table, row)));

      // Lo que ya no está en el servidor se borró desde otro equipo.
      const local = (await dexieTable.toArray()) as Record<string, unknown>[];
      const stale = local
        .map((row) => rowPk(table, row))
        .filter((pk) => !remotePks.has(pk) && !dirty.has(pk))
        .map((pk) => localKey(table, pk));
      await dexieTable.bulkDelete(stale);
      await dexieTable.bulkPut(rows.filter((row) => !dirty.has(rowPk(table, row))));
    }
  });
}

export type SyncResult = "ok" | "offline";

let syncing: Promise<SyncResult> | null = null;
let rerun = false;

/**
 * Sube lo pendiente y baja lo último. Nunca rechaza: sin red devuelve "offline".
 * Si se pide durante otra corrida, esa corrida repite antes de resolver, así quien
 * espera la promesa sabe que sus cambios ya intentaron subirse.
 */
export function syncNow(): Promise<SyncResult> {
  if (syncing) {
    rerun = true;
    return syncing;
  }
  syncing = (async () => {
    let result: SyncResult;
    do {
      rerun = false;
      result = await runSync();
    } while (rerun);
    return result;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function runSync(): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  try {
    await flush();
    await pull();
    await refreshLogoCache();
    return "ok";
  } catch (error) {
    if (!(error instanceof TransientError) && !/fetch|network/i.test(String(error))) console.error(error);
    return "offline";
  }
}

/** Guarda el logo como data URL: el PDF tiene que poder generarse sin conexión. */
async function refreshLogoCache() {
  const professional = await db.professionals.toCollection().first();
  const url = professional?.logo_url;
  const cached = (await db.kv.get("logo"))?.value as { url: string } | undefined;
  if (!url) {
    if (cached) await db.kv.delete("logo");
    return;
  }
  if (cached?.url === url) return;
  const response = await fetch(url);
  if (!response.ok) return;
  await setKv("logo", { url, dataUrl: await blobToDataUrl(await response.blob()) });
}

/** Vuelve a intentar los cambios que el servidor había rechazado. */
export async function retryFailed() {
  await db.outbox.toCollection().modify((entry) => {
    delete entry.error;
  });
  return syncNow();
}
