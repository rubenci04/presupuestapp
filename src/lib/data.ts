import { budgetTotals, computeTotals, lineTotal, saleUnitPrice } from "./budget-calc";
import { db } from "./db";
import { todayISO } from "./format";
import { markDirty, rowPk, syncNow } from "./sync";
import { BUCKETS, getSupabase } from "./supabase";
import type {
  Budget,
  BudgetItem,
  BudgetItemType,
  BudgetPdf,
  BudgetStatus,
  Client,
  IvaPercent,
  Job,
  JobPhoto,
  Oficio,
  Professional,
} from "./types";

// Todas las escrituras de la app pasan por acá: IndexedDB + outbox en una transacción, y
// después un sync en segundo plano. La UI se actualiza sola porque lee con useLiveQuery.

function afterWrite() {
  void syncNow();
}

export const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

export async function getProfessional(): Promise<Professional> {
  const professional = await db.professionals.toCollection().first();
  if (!professional) throw new Error("Todavía no se cargó tu perfil. Revisá tu conexión.");
  return professional;
}

// ---------------------------------------------------------------- Perfil

export async function saveProfile(changes: Partial<Professional>) {
  const professional = await getProfessional();
  await db.transaction("rw", db.professionals, db.outbox, async () => {
    await db.professionals.update(professional.id, changes);
    await markDirty("professionals", professional.id, "upsert");
  });
  afterWrite();
}

/** Requiere conexión: el logo se valida en el servidor (2 MB, PNG/JPG). */
export async function uploadLogo(file: File): Promise<string> {
  const professional = await getProfessional();
  const extension = file.type === "image/png" ? "png" : "jpg";
  // Nombre nuevo en cada subida para que el cache del navegador no sirva el logo viejo.
  const path = `${professional.user_id}/logo-${Date.now()}.${extension}`;
  const storage = getSupabase().storage.from(BUCKETS.logos);
  const { error } = await storage.upload(path, file, { contentType: file.type });
  if (error) throw error;
  return storage.getPublicUrl(path).data.publicUrl;
}

export async function setOficios(oficioIds: string[]) {
  const professional = await getProfessional();
  await db.transaction("rw", db.professional_oficios, db.outbox, async () => {
    const current = await db.professional_oficios.toArray();
    const wanted = new Set(oficioIds);
    for (const row of current) {
      if (!wanted.has(row.oficio_id)) {
        await db.professional_oficios.delete([row.professional_id, row.oficio_id]);
        await markDirty("professional_oficios", rowPk("professional_oficios", { ...row }), "delete");
      }
      wanted.delete(row.oficio_id);
    }
    for (const oficio_id of wanted) {
      const row = { professional_id: professional.id, oficio_id };
      await db.professional_oficios.put(row);
      await markDirty("professional_oficios", rowPk("professional_oficios", { ...row }), "upsert");
    }
  });
  afterWrite();
}

export async function addCustomOficio(name: string, unit: string): Promise<Oficio> {
  const professional = await getProfessional();
  const oficio: Oficio = {
    id: newId(),
    name: name.trim(),
    description: "",
    unit,
    category: "Personalizados",
    professional_id: professional.id,
  };
  await db.transaction("rw", db.oficios, db.outbox, async () => {
    await db.oficios.add(oficio);
    await markDirty("oficios", oficio.id, "upsert");
  });
  afterWrite();
  return oficio;
}

// ---------------------------------------------------------------- Clientes

export type ClientInput = Pick<Client, "name" | "phone" | "address" | "email">;

export async function saveClient(input: ClientInput, id?: string): Promise<Client> {
  const professional = await getProfessional();
  const existing = id ? await db.clients.get(id) : undefined;
  const client: Client = existing
    ? { ...existing, ...input }
    : { ...input, id: newId(), professional_id: professional.id, created_at: nowIso() };
  await db.transaction("rw", db.clients, db.outbox, async () => {
    await db.clients.put(client);
    await markDirty("clients", client.id, "upsert");
  });
  afterWrite();
  return client;
}

/** Devuelve false si tiene presupuestos: quedan como historial y no se puede borrar. */
export async function deleteClient(id: string): Promise<boolean> {
  const budgets = await db.budgets.where("client_id").equals(id).count();
  if (budgets > 0) return false;
  await db.transaction("rw", db.clients, db.outbox, async () => {
    await db.clients.delete(id);
    await markDirty("clients", id, "delete");
  });
  afterWrite();
  return true;
}

// ---------------------------------------------------------------- Presupuestos

export interface ItemInput {
  id: string;
  type: BudgetItemType;
  description: string;
  quantity: number;
  unit: string;
  /** Mano de obra: precio unitario. Materiales: se calcula de costo + markup. */
  unit_price: number;
  cost_price: number | null;
  markup_percent: number | null;
}

export interface BudgetInput {
  client_id: string;
  date: string;
  validity_days: number;
  advance_percent: number;
  warranty_days: number;
  payment_method: string;
  notes: string;
  iva_percent: IvaPercent;
}

export function buildItems(budgetId: string, items: ItemInput[]): BudgetItem[] {
  return items.map((item, position) => {
    const unit_price =
      item.type === "material"
        ? saleUnitPrice(item.cost_price ?? 0, item.markup_percent ?? 0)
        : item.unit_price;
    return {
      ...item,
      budget_id: budgetId,
      unit_price,
      total: lineTotal(item.quantity, unit_price),
      position,
    };
  });
}

export async function saveBudget(input: BudgetInput, itemInputs: ItemInput[], id?: string): Promise<Budget> {
  const professional = await getProfessional();
  const existing = id ? await db.budgets.get(id) : undefined;
  const budgetId = existing?.id ?? newId();
  const items = buildItems(budgetId, itemInputs);
  const totals = budgetTotals(computeTotals(items, input.iva_percent));
  const budget: Budget = existing
    ? { ...existing, ...input, ...totals }
    : {
        ...input,
        ...totals,
        id: budgetId,
        professional_id: professional.id,
        number: null,
        status: "draft",
        pdf_url: null,
        created_at: nowIso(),
      };

  await db.transaction("rw", db.budgets, db.budget_items, db.outbox, async () => {
    await db.budgets.put(budget);
    await markDirty("budgets", budget.id, "upsert");
    const keep = new Set(items.map((item) => item.id));
    const previous = await db.budget_items.where("budget_id").equals(budgetId).toArray();
    for (const item of previous) {
      if (!keep.has(item.id)) {
        await db.budget_items.delete(item.id);
        await markDirty("budget_items", item.id, "delete");
      }
    }
    await db.budget_items.bulkPut(items);
    for (const item of items) await markDirty("budget_items", item.id, "upsert");
  });
  afterWrite();
  return budget;
}

export async function setBudgetStatus(id: string, status: BudgetStatus) {
  await db.transaction("rw", db.budgets, db.outbox, async () => {
    await db.budgets.update(id, { status });
    await markDirty("budgets", id, "upsert");
  });
  afterWrite();
}

/** Copia un presupuesto como borrador nuevo, con fecha de hoy. */
export async function duplicateBudget(id: string): Promise<Budget> {
  const source = await db.budgets.get(id);
  if (!source) throw new Error("No se encontró el presupuesto.");
  const budgetId = newId();
  const copy: Budget = {
    ...source,
    id: budgetId,
    number: null,
    date: todayISO(),
    status: "draft",
    pdf_url: null,
    created_at: nowIso(),
  };
  const items = (await db.budget_items.where("budget_id").equals(id).toArray()).map((item) => ({
    ...item,
    id: newId(),
    budget_id: budgetId,
  }));
  await db.transaction("rw", db.budgets, db.budget_items, db.outbox, async () => {
    await db.budgets.add(copy);
    await markDirty("budgets", copy.id, "upsert");
    await db.budget_items.bulkAdd(items);
    for (const item of items) await markDirty("budget_items", item.id, "upsert");
  });
  afterWrite();
  return copy;
}

/** Devuelve false si ya se convirtió en trabajo. */
export async function deleteBudget(id: string): Promise<boolean> {
  const job = await db.jobs.where("budget_id").equals(id).first();
  if (job) return false;
  await db.transaction("rw", db.budgets, db.budget_items, db.budget_pdfs, db.blobs, db.outbox, async () => {
    for (const pdf of await db.budget_pdfs.where("budget_id").equals(id).toArray()) {
      await db.budget_pdfs.delete(pdf.id);
      await db.blobs.delete(pdf.id);
      await markDirty("budget_pdfs", pdf.id, "delete", pdf.url);
    }
    for (const item of await db.budget_items.where("budget_id").equals(id).toArray()) {
      await db.budget_items.delete(item.id);
      await markDirty("budget_items", item.id, "delete");
    }
    await db.budgets.delete(id);
    await markDirty("budgets", id, "delete");
  });
  afterWrite();
  return true;
}

/** Registra un PDF en el historial; el archivo se sube con el próximo sync. */
export async function recordPdf(budget: Budget, blob: Blob, fileName: string): Promise<BudgetPdf> {
  const professional = await getProfessional();
  const id = newId();
  const path = `${professional.user_id}/${budget.id}/${id}.pdf`;
  const pdf: BudgetPdf = {
    id,
    budget_id: budget.id,
    professional_id: professional.id,
    url: path,
    file_name: fileName,
    total: budget.total,
    created_at: nowIso(),
  };
  await db.transaction("rw", db.budgets, db.budget_pdfs, db.blobs, db.outbox, async () => {
    await db.budget_pdfs.add(pdf);
    await db.blobs.put({ id, bucket: "pdfs", path, blob });
    await markDirty("budget_pdfs", id, "upsert");
    await db.budgets.update(budget.id, { pdf_url: path });
    await markDirty("budgets", budget.id, "upsert");
  });
  afterWrite();
  return pdf;
}

const SHARE_LINK_SECONDS = 60 * 60 * 24 * 30;

/** Link temporal al PDF para mandar por WhatsApp. Null sin conexión o si todavía no subió. */
export async function signedPdfLink(path: string): Promise<string | null> {
  try {
    const { data } = await getSupabase().storage.from(BUCKETS.pdfs).createSignedUrl(path, SHARE_LINK_SECONDS);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Trabajos

export async function createJobFromBudget(budgetId: string): Promise<Job> {
  const professional = await getProfessional();
  const existing = await db.jobs.where("budget_id").equals(budgetId).first();
  if (existing) return existing;
  const job: Job = {
    id: newId(),
    budget_id: budgetId,
    professional_id: professional.id,
    status: "pending",
    start_date: null,
    end_date: null,
    notes: "",
    created_at: nowIso(),
  };
  await db.transaction("rw", db.jobs, db.outbox, async () => {
    await db.jobs.add(job);
    await markDirty("jobs", job.id, "upsert");
  });
  afterWrite();
  return job;
}

export async function updateJob(id: string, changes: Partial<Job>) {
  await db.transaction("rw", db.jobs, db.outbox, async () => {
    await db.jobs.update(id, changes);
    await markDirty("jobs", id, "upsert");
  });
  afterWrite();
}

const MAX_PHOTO_SIDE = 1600;

/** Las fotos de celular pesan varios MB; se achican antes de guardar para no gastar datos. */
async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (blob) return blob;
  } catch {
    // Formato que el navegador no decodifica: se sube tal cual.
  }
  return file;
}

export async function addJobPhoto(jobId: string, file: File): Promise<JobPhoto> {
  const professional = await getProfessional();
  const blob = await compressPhoto(file);
  const id = newId();
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${professional.user_id}/${jobId}/${id}.${extension}`;
  const photo: JobPhoto = { id, job_id: jobId, url: path, created_at: nowIso() };
  await db.transaction("rw", db.job_photos, db.blobs, db.outbox, async () => {
    await db.job_photos.add(photo);
    await db.blobs.put({ id, bucket: "job-photos", path, blob });
    await markDirty("job_photos", id, "upsert");
  });
  afterWrite();
  return photo;
}

export async function deleteJobPhoto(photo: JobPhoto) {
  await db.transaction("rw", db.job_photos, db.blobs, db.outbox, async () => {
    await db.job_photos.delete(photo.id);
    await db.blobs.delete(photo.id);
    await markDirty("job_photos", photo.id, "delete", photo.url);
  });
  afterWrite();
}

/** URLs firmadas para mostrar las fotos ya subidas. Vacío si no hay conexión. */
export async function signedPhotoUrls(photos: JobPhoto[]): Promise<Record<string, string>> {
  if (photos.length === 0) return {};
  try {
    const { data } = await getSupabase()
      .storage.from(BUCKETS.photos)
      .createSignedUrls(photos.map((photo) => photo.url), 60 * 60);
    const byPath = new Map((data ?? []).map((entry) => [entry.path, entry.signedUrl]));
    return Object.fromEntries(photos.flatMap((photo) => {
      const url = byPath.get(photo.url);
      return url ? [[photo.id, url]] : [];
    }));
  } catch {
    return {};
  }
}
