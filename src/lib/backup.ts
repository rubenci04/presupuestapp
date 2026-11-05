import { LAST_BACKUP_KEY, LOGO_KEY, NEXT_NUMBER_KEY } from "./config";
import { db, getKv, setKv, type PendingBlob } from "./db";
import { base64ToBlob, blobToBase64 } from "./files";
import { todayISO } from "./format";

/** Error con un mensaje listo para mostrarle a la persona. */
export class BackupError extends Error {}

const FORMAT_VERSION = 1;

const TABLES = [
  "professionals",
  "oficios",
  "professional_oficios",
  "clients",
  "budgets",
  "budget_items",
  "jobs",
  "job_photos",
  "budget_pdfs",
] as const;

interface BackupFile {
  app: "presupuestapp";
  version: number;
  exportedAt: string;
  tables: Record<(typeof TABLES)[number], Record<string, unknown>[]>;
  settings: { nextBudgetNumber: number | null };
  logo: { type: string; data: string } | null;
  /** Fotos y PDFs. */
  files: { id: string; bucket: PendingBlob["bucket"]; path: string; type: string; data: string }[];
}

/** Junta todo (datos, logo, fotos y PDFs) en un solo archivo. */
export async function createBackup(): Promise<{ blob: Blob; fileName: string }> {
  const tables = {} as BackupFile["tables"];
  for (const name of TABLES) tables[name] = (await db.table(name).toArray()) as Record<string, unknown>[];

  const logo = await getKv<Blob>(LOGO_KEY);
  const files: BackupFile["files"] = [];
  for (const file of await db.blobs.toArray()) {
    files.push({
      id: file.id,
      bucket: file.bucket,
      path: file.path,
      type: file.blob.type,
      data: await blobToBase64(file.blob),
    });
  }

  const backup: BackupFile = {
    app: "presupuestapp",
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
    settings: { nextBudgetNumber: (await getKv<number>(NEXT_NUMBER_KEY)) ?? null },
    logo: logo ? { type: logo.type, data: await blobToBase64(logo) } : null,
    files,
  };
  await setKv(LAST_BACKUP_KEY, backup.exportedAt);
  return {
    blob: new Blob([JSON.stringify(backup)], { type: "application/json" }),
    fileName: `PresupuestApp-copia-${todayISO()}.json`,
  };
}

function parseBackup(text: string): BackupFile {
  let data: Partial<BackupFile>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("Ese archivo no es una copia de PresupuestApp.");
  }
  if (!data || data.app !== "presupuestapp" || typeof data.version !== "number") {
    throw new BackupError("Ese archivo no es una copia de PresupuestApp.");
  }
  if (data.version > FORMAT_VERSION) {
    throw new BackupError("Esa copia es de una versión más nueva de la app. Actualizá la app y probá de nuevo.");
  }
  const tables = data.tables;
  const valid =
    tables &&
    TABLES.every((name) => Array.isArray(tables[name]) && tables[name].every((row) => row && typeof row === "object")) &&
    Array.isArray(data.files);
  if (!valid) throw new BackupError("La copia está incompleta o dañada.");
  return data as BackupFile;
}

/** Reemplaza TODO lo que hay en este equipo por el contenido de la copia. */
export async function restoreBackup(file: Blob): Promise<void> {
  const backup = parseBackup(await file.text());
  if (backup.tables.professionals.length === 0) throw new BackupError("La copia no tiene tus datos.");

  // Se decodifica todo antes de tocar nada: si algo falla, no se pierde lo que había.
  let blobs: PendingBlob[];
  let logo: Blob | null;
  try {
    blobs = backup.files.map((entry) => ({
      id: entry.id,
      bucket: entry.bucket,
      path: entry.path,
      blob: base64ToBlob(entry.data, entry.type),
    }));
    logo = backup.logo ? base64ToBlob(backup.logo.data, backup.logo.type) : null;
  } catch {
    throw new BackupError("La copia está dañada.");
  }

  await db.transaction("rw", [...TABLES.map((name) => db.table(name)), db.blobs, db.kv, db.outbox], async () => {
    for (const name of TABLES) {
      await db.table(name).clear();
      await db.table(name).bulkPut(backup.tables[name]);
    }
    await db.outbox.clear();
    await db.blobs.clear();
    await db.blobs.bulkPut(blobs);
    if (logo) await db.kv.put({ key: LOGO_KEY, value: logo });
    else await db.kv.delete(LOGO_KEY);
    if (backup.settings?.nextBudgetNumber) {
      await db.kv.put({ key: NEXT_NUMBER_KEY, value: backup.settings.nextBudgetNumber });
    }
    await db.kv.put({ key: LAST_BACKUP_KEY, value: backup.exportedAt });
  });
}
