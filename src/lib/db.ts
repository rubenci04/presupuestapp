import Dexie, { type EntityTable } from "dexie";
import type {
  Budget,
  BudgetItem,
  BudgetPdf,
  Client,
  Job,
  JobPhoto,
  Oficio,
  Professional,
  ProfessionalOficio,
} from "./types";

/**
 * Cambio pendiente de subir. Guarda solo la referencia a la fila: al sincronizar se
 * lee la versión actual, así varias ediciones offline de lo mismo se suben una vez.
 */
export interface OutboxEntry {
  key: string; // `${table}:${pk}`
  table: SyncedTable;
  pk: string;
  op: "upsert" | "delete";
  /** Sube con cada edición para detectar cambios hechos mientras se estaba subiendo. */
  rev: number;
  /** Archivo a borrar del bucket junto con la fila. */
  removeFile?: string;
  error?: string;
}

/** Archivo generado sin conexión, a la espera de subirse junto con su fila. */
export interface PendingBlob {
  id: string; // id de la fila dueña (job_photos / budget_pdfs)
  bucket: "pdfs" | "job-photos";
  path: string;
  blob: Blob;
}

export type SyncedTable =
  | "professionals"
  | "oficios"
  | "professional_oficios"
  | "clients"
  | "budgets"
  | "budget_items"
  | "jobs"
  | "job_photos"
  | "budget_pdfs";

export class AppDB extends Dexie {
  professionals!: EntityTable<Professional, "id">;
  oficios!: EntityTable<Oficio, "id">;
  professional_oficios!: Dexie.Table<ProfessionalOficio, [string, string]>;
  clients!: EntityTable<Client, "id">;
  budgets!: EntityTable<Budget, "id">;
  budget_items!: EntityTable<BudgetItem, "id">;
  jobs!: EntityTable<Job, "id">;
  job_photos!: EntityTable<JobPhoto, "id">;
  budget_pdfs!: EntityTable<BudgetPdf, "id">;
  outbox!: EntityTable<OutboxEntry, "key">;
  blobs!: EntityTable<PendingBlob, "id">;
  kv!: Dexie.Table<{ key: string; value: unknown }, string>;

  constructor() {
    super("presupuestapp");
    this.version(1).stores({
      professionals: "id, user_id",
      oficios: "id, professional_id",
      professional_oficios: "[professional_id+oficio_id], oficio_id",
      clients: "id, name",
      budgets: "id, client_id, number, date, status",
      budget_items: "id, budget_id",
      jobs: "id, budget_id, status, start_date",
      job_photos: "id, job_id",
      budget_pdfs: "id, budget_id, created_at",
      outbox: "key, table",
      blobs: "id",
      kv: "key",
    });
  }
}

export const db = new AppDB();

export async function getKv<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}

export function setKv(key: string, value: unknown) {
  return db.kv.put({ key, value });
}

/** Borra todos los datos locales (cierre de sesión o cambio de usuario en el equipo). */
export async function clearLocalData() {
  await Promise.all(db.tables.map((table) => table.clear()));
}
