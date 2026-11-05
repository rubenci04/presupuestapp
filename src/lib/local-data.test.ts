import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { BackupError, createBackup, restoreBackup } from "./backup";
import { ensureCatalog } from "./catalog";
import { LAST_BACKUP_KEY } from "./config";
import {
  createJobFromBudget,
  createLocalProfile,
  deleteBudget,
  duplicateBudget,
  getLogoBlob,
  getProfessional,
  recordPdf,
  saveBudget,
  saveClient,
  setOficios,
  type BudgetInput,
  type ItemInput,
} from "./data";
import { clearLocalData, db, getKv } from "./db";

const input = (client_id: string): BudgetInput => ({
  client_id,
  date: "2026-11-04",
  validity_days: 15,
  advance_percent: 50,
  warranty_days: 30,
  payment_method: "Efectivo",
  notes: "",
  iva_percent: 21,
});

// Cada presupuesto necesita ids de ítem propios, como en la app.
const makeItems = (): ItemInput[] => [
  { id: crypto.randomUUID(), type: "labor", description: "Mano de obra", quantity: 1, unit: "global", unit_price: 1000, cost_price: null, markup_percent: null },
  { id: crypto.randomUUID(), type: "material", description: "Caño", quantity: 2, unit: "unidad", unit_price: 0, cost_price: 100, markup_percent: 30 },
];

const bytes = (...values: number[]) => new Blob([new Uint8Array(values)], { type: "image/png" });

async function setup() {
  await ensureCatalog();
  await createLocalProfile({ brand_name: "Plomería Don Carlos", phone: "11 2345-6789", primary_color: "#0f766e" }, bytes(1, 2, 3, 250, 255));
  return saveClient({ name: "José", phone: "", address: "", email: null });
}

beforeEach(async () => {
  await clearLocalData();
});

describe("catálogo", () => {
  it("se carga una sola vez, aunque se llame muchas", async () => {
    await Promise.all([ensureCatalog(), ensureCatalog(), ensureCatalog()]);
    expect(await db.oficios.count()).toBe(45);
    await ensureCatalog();
    expect(await db.oficios.count()).toBe(45);
  });
});

describe("perfil local", () => {
  it("se crea sin cuenta, con el logo guardado como Blob", async () => {
    await setup();
    const professional = await getProfessional();
    expect(professional).toMatchObject({ brand_name: "Plomería Don Carlos", primary_color: "#0F766E", user_id: "local" });
    expect(professional.onboarded_at).toBeTruthy();
    const logo = await getLogoBlob();
    expect(Array.from(new Uint8Array(await logo!.arrayBuffer()))).toEqual([1, 2, 3, 250, 255]);
  });

  it("no deja nada en la cola de sincronización", async () => {
    const client = await setup();
    await saveBudget(input(client.id), makeItems());
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("numeración local", () => {
  it("es correlativa desde 1 y el presupuesto nunca queda sin número", async () => {
    const client = await setup();
    const first = await saveBudget(input(client.id), makeItems());
    const second = await saveBudget(input(client.id), makeItems());
    expect([first.number, second.number]).toEqual([1, 2]);
  });

  it("editar un presupuesto conserva su número", async () => {
    const client = await setup();
    const first = await saveBudget(input(client.id), makeItems());
    await saveBudget(input(client.id), makeItems());
    const edited = await saveBudget({ ...input(client.id), notes: "cambio" }, makeItems(), first.id);
    expect(edited.number).toBe(1);
  });

  it("no reutiliza el número de uno borrado", async () => {
    const client = await setup();
    await saveBudget(input(client.id), makeItems());
    const second = await saveBudget(input(client.id), makeItems());
    await deleteBudget(second.id);
    expect((await saveBudget(input(client.id), makeItems())).number).toBe(3);
  });

  it("duplicar toma el siguiente número", async () => {
    const client = await setup();
    const first = await saveBudget(input(client.id), makeItems());
    expect((await duplicateBudget(first.id)).number).toBe(2);
  });
});

describe("copia de seguridad", () => {
  async function fullData() {
    const client = await setup();
    const oficio = (await db.oficios.toArray()).find((row) => row.name === "Plomero")!;
    await setOficios([oficio.id]);
    const budget = await saveBudget(input(client.id), makeItems());
    await saveBudget(input(client.id), makeItems());
    await recordPdf(budget, new Blob(["%PDF-1.4 prueba"], { type: "application/pdf" }), "Presupuesto-1.pdf");
    const job = await createJobFromBudget(budget.id);
    await db.job_photos.add({ id: "foto-1", job_id: job.id, url: "local/foto-1.jpg", created_at: "2026-11-04T10:00:00.000Z" });
    await db.blobs.put({ id: "foto-1", bucket: "job-photos", path: "local/foto-1.jpg", blob: new Blob([new Uint8Array([9, 8, 7, 255, 0])], { type: "image/jpeg" }) });
    return { budget };
  }

  it("exporta e importa todo, incluidos logo, foto, PDF y el contador", async () => {
    await fullData();
    const { blob } = await createBackup();
    expect(await getKv<string>(LAST_BACKUP_KEY)).toBeTruthy();

    await clearLocalData();
    expect(await db.budgets.count()).toBe(0);
    await restoreBackup(blob);

    expect(await db.budgets.count()).toBe(2);
    expect(await db.budget_items.count()).toBe(4);
    expect(await db.clients.count()).toBe(1);
    expect(await db.jobs.count()).toBe(1);
    expect(await db.oficios.count()).toBe(45);
    expect(await db.professional_oficios.count()).toBe(1);
    expect((await getProfessional()).brand_name).toBe("Plomería Don Carlos");

    const logo = await getLogoBlob();
    expect(Array.from(new Uint8Array(await logo!.arrayBuffer()))).toEqual([1, 2, 3, 250, 255]);
    expect(logo!.type).toBe("image/png");

    const photo = await db.blobs.get("foto-1");
    expect(Array.from(new Uint8Array(await photo!.blob.arrayBuffer()))).toEqual([9, 8, 7, 255, 0]);
    expect(photo!.blob.type).toBe("image/jpeg");

    const [pdf] = await db.budget_pdfs.toArray();
    expect(await (await db.blobs.get(pdf.id))!.blob.text()).toBe("%PDF-1.4 prueba");

    // El siguiente presupuesto sigue la numeración.
    const client = (await db.clients.toArray())[0];
    expect((await saveBudget(input(client.id), makeItems())).number).toBe(3);
  });

  it("al importar reemplaza lo que había", async () => {
    await fullData();
    const { blob } = await createBackup();
    const client = (await db.clients.toArray())[0];
    await saveBudget(input(client.id), makeItems()); // Nº 3, que la copia no tiene.
    expect(await db.budgets.count()).toBe(3);
    await restoreBackup(blob);
    expect(await db.budgets.count()).toBe(2);
  });

  it.each([
    ["texto cualquiera", "hola"],
    ["JSON de otra app", JSON.stringify({ app: "otra", version: 1 })],
    ["versión futura", JSON.stringify({ app: "presupuestapp", version: 99 })],
    ["tablas incompletas", JSON.stringify({ app: "presupuestapp", version: 1, tables: {}, files: [] })],
  ])("rechaza %s y no toca los datos", async (_name, content) => {
    await fullData();
    await expect(restoreBackup(new Blob([content]))).rejects.toBeInstanceOf(BackupError);
    expect(await db.budgets.count()).toBe(2);
  });
});
