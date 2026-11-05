import { budgetTotals, computeTotals, lineTotal, saleUnitPrice } from "./budget-calc";
import { LOCAL_LOGO_MARK, LOGO_KEY, NEXT_NUMBER_KEY } from "./config";
import { db, getKv } from "./db";
import { resizeImage } from "./files";
import { todayISO } from "./format";
import { markDirty, rowPk } from "./sync";
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

// Todas las escrituras de la app pasan por acá y van solo a IndexedDB: no hay cuenta ni
// nube. markDirty queda como gancho para un respaldo futuro (hoy no hace nada).
// La UI se actualiza sola porque lee con useLiveQuery.

export const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

export async function getProfessional(): Promise<Professional> {
  const professional = await db.professionals.toCollection().first();
  if (!professional) throw new Error("Todavía no se cargó tu perfil.");
  return professional;
}

// ---------------------------------------------------------------- Perfil

export interface WelcomeInput {
  brand_name: string;
  phone: string;
  primary_color: string;
}

/** Crea el perfil de este equipo con los datos de la pantalla de bienvenida. */
export async function createLocalProfile(input: WelcomeInput, logo: Blob | null): Promise<Professional> {
  const professional: Professional = {
    id: newId(),
    user_id: "local",
    name: "",
    last_name: "",
    phone: input.phone,
    cuit: null,
    address: "",
    zone: "",
    logo_url: logo ? LOCAL_LOGO_MARK : null,
    brand_name: input.brand_name,
    primary_color: input.primary_color.toUpperCase(),
    footer_text: "",
    onboarded_at: nowIso(),
    created_at: nowIso(),
  };
  await db.transaction("rw", db.professionals, db.kv, db.outbox, async () => {
    await db.professionals.clear();
    await db.professionals.add(professional);
    if (logo) await db.kv.put({ key: LOGO_KEY, value: logo });
    await markDirty("professionals", professional.id, "upsert");
  });
  return professional;
}

export async function saveProfile(changes: Partial<Professional>) {
  const professional = await getProfessional();
  await db.transaction("rw", db.professionals, db.outbox, async () => {
    await db.professionals.update(professional.id, changes);
    await markDirty("professionals", professional.id, "upsert");
  });
}

export async function getLogoBlob(): Promise<Blob | null> {
  return ((await getKv<Blob>(LOGO_KEY)) as Blob | undefined) ?? null;
}

export async function setLogo(logo: Blob | null) {
  const professional = await getProfessional();
  await db.transaction("rw", db.professionals, db.kv, db.outbox, async () => {
    if (logo) await db.kv.put({ key: LOGO_KEY, value: logo });
    else await db.kv.delete(LOGO_KEY);
    await db.professionals.update(professional.id, { logo_url: logo ? LOCAL_LOGO_MARK : null });
    await markDirty("professionals", professional.id, "upsert");
  });
}

const MAX_LOGO_SIDE = 600;

/** Achica el logo para que el PDF y la copia de seguridad no pesen de más. */
export async function prepareLogo(file: File): Promise<Blob> {
  return resizeImage(file, MAX_LOGO_SIDE, file.type === "image/png" ? "image/png" : "image/jpeg", 0.9);
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

/**
 * Siguiente número correlativo (1, 2, 3...). Usa un contador aparte y no "el mayor + 1":
 * si se borra el último presupuesto, su número no se vuelve a usar, porque ya pudo
 * haberse mandado al cliente. Llamar dentro de una transacción que incluya budgets y kv.
 */
async function takeBudgetNumber(): Promise<number> {
  const stored = await getKv<number>(NEXT_NUMBER_KEY);
  const highest = (await db.budgets.orderBy("number").last())?.number ?? 0;
  const number = Math.max(stored ?? 1, highest + 1);
  await db.kv.put({ key: NEXT_NUMBER_KEY, value: number + 1 });
  return number;
}

export async function saveBudget(input: BudgetInput, itemInputs: ItemInput[], id?: string): Promise<Budget> {
  const professional = await getProfessional();
  const existing = id ? await db.budgets.get(id) : undefined;
  const budgetId = existing?.id ?? newId();
  const items = buildItems(budgetId, itemInputs);
  const totals = budgetTotals(computeTotals(items, input.iva_percent));

  return db.transaction("rw", db.budgets, db.budget_items, db.kv, db.outbox, async () => {
    const budget: Budget = existing
      ? { ...existing, ...input, ...totals }
      : {
          ...input,
          ...totals,
          id: budgetId,
          professional_id: professional.id,
          number: await takeBudgetNumber(),
          status: "draft",
          pdf_url: null,
          created_at: nowIso(),
        };
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
    return budget;
  });
}

export async function setBudgetStatus(id: string, status: BudgetStatus) {
  await db.transaction("rw", db.budgets, db.outbox, async () => {
    await db.budgets.update(id, { status });
    await markDirty("budgets", id, "upsert");
  });
}

/** Copia un presupuesto como borrador nuevo, con fecha de hoy y número propio. */
export async function duplicateBudget(id: string): Promise<Budget> {
  const source = await db.budgets.get(id);
  if (!source) throw new Error("No se encontró el presupuesto.");
  const budgetId = newId();
  const sourceItems = await db.budget_items.where("budget_id").equals(id).toArray();
  return db.transaction("rw", db.budgets, db.budget_items, db.kv, db.outbox, async () => {
    const copy: Budget = {
      ...source,
      id: budgetId,
      number: await takeBudgetNumber(),
      date: todayISO(),
      status: "draft",
      pdf_url: null,
      created_at: nowIso(),
    };
    const items = sourceItems.map((item) => ({ ...item, id: newId(), budget_id: budgetId }));
    await db.budgets.add(copy);
    await markDirty("budgets", copy.id, "upsert");
    await db.budget_items.bulkAdd(items);
    for (const item of items) await markDirty("budget_items", item.id, "upsert");
    return copy;
  });
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
  return true;
}

/** Guarda el PDF generado en el historial. El archivo vive en IndexedDB. */
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
  return pdf;
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
  return job;
}

export async function updateJob(id: string, changes: Partial<Job>) {
  await db.transaction("rw", db.jobs, db.outbox, async () => {
    await db.jobs.update(id, changes);
    await markDirty("jobs", id, "upsert");
  });
}

const MAX_PHOTO_SIDE = 1600;

export async function addJobPhoto(jobId: string, file: File): Promise<JobPhoto> {
  const professional = await getProfessional();
  // Las fotos de celular pesan varios MB: se achican para no llenar la memoria.
  const blob = await resizeImage(file, MAX_PHOTO_SIDE, "image/jpeg", 0.8);
  const id = newId();
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${professional.user_id}/${jobId}/${id}.${extension}`;
  const photo: JobPhoto = { id, job_id: jobId, url: path, created_at: nowIso() };
  await db.transaction("rw", db.job_photos, db.blobs, db.outbox, async () => {
    await db.job_photos.add(photo);
    await db.blobs.put({ id, bucket: "job-photos", path, blob });
    await markDirty("job_photos", id, "upsert");
  });
  return photo;
}

export async function deleteJobPhoto(photo: JobPhoto) {
  await db.transaction("rw", db.job_photos, db.blobs, db.outbox, async () => {
    await db.job_photos.delete(photo.id);
    await db.blobs.delete(photo.id);
    await markDirty("job_photos", photo.id, "delete", photo.url);
  });
}
