import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClientInBudget, registerAndOnboard, shot } from "../helpers";

// Flujos contra un Supabase local de verdad (Auth, PostgREST, Storage, RLS).
// Requiere `npx supabase start`. Los datos del usuario se consultan con su propia sesión,
// así que también pasan por RLS.
const API = "http://127.0.0.1:54321";
const MAILPIT = "http://127.0.0.1:54324";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const KONG = "supabase_kong_presupuestapp";
const PASSWORD = "clave-de-prueba";

const uniqueEmail = (name: string) => `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ejemplo.com`;

function newClient(): SupabaseClient {
  return createClient(API, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function clientFor(email: string, password = PASSWORD): Promise<SupabaseClient> {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return client;
}

async function rows<T = Record<string, unknown>>(client: SupabaseClient, table: string): Promise<T[]> {
  const { data, error } = await client.from(table).select("*");
  expect(error).toBeNull();
  return (data ?? []) as T[];
}

async function addLaborLine(page: Page, description: string, price: string) {
  await page.getByRole("button", { name: "Agregar mano de obra" }).click();
  const line = page.locator("section", { hasText: "Mano de obra" }).locator("li").last();
  await line.getByLabel("Descripción").fill(description);
  await line.getByLabel("Precio unitario").fill(price);
}

test("flujo completo con Auth, PostgREST, Storage y RLS reales", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const email = uniqueEmail("carlos");

  await registerAndOnboard(page, email);
  const user = await clientFor(email);

  // Perfil, oficios y logo.
  await expect.poll(async () => (await rows<{ onboarded_at: string | null }>(user, "professionals"))[0]?.onboarded_at).toBeTruthy();
  const [professional] = await rows<{ id: string; primary_color: string; logo_url: string; last_name: string }>(user, "professionals");
  expect(professional).toMatchObject({ primary_color: "#0F766E", last_name: "Peña" });
  await expect.poll(async () => (await rows(user, "professional_oficios")).length).toBe(3);
  expect(await rows(user, "oficios")).toHaveLength(46);

  // El logo es público y es exactamente el archivo que se subió.
  const logo = await fetch(professional.logo_url);
  expect(logo.status).toBe(200);
  expect(logo.headers.get("content-type")).toContain("image/png");
  expect(Buffer.from(await logo.arrayBuffer()).equals(readFileSync("public/icons/icon-192.png"))).toBe(true);

  // Presupuesto con mano de obra y materiales.
  await page.getByRole("link", { name: "Nuevo presupuesto" }).click();
  await createClientInBudget(page, "José Fernández", "011 15 2345-6789");
  await addLaborLine(page, "Instalación de termotanque", "85.000");
  await page.getByRole("button", { name: "Agregar material" }).click();
  const material = page.locator("section", { hasText: "Materiales" }).locator("li").first();
  await material.getByLabel("Descripción").fill("Caño termofusión 1/2");
  await material.locator("input").nth(1).fill("4");
  await material.getByLabel("Costo unitario").fill("1.000,50");
  await page.getByLabel("Anticipo %").fill("50");
  await page.getByRole("button", { name: "Generar PDF" }).click();

  await expect(page.getByRole("heading", { name: "Nº 1" })).toBeVisible({ timeout: 45_000 });
  const whatsappLink = page.getByRole("link", { name: "Enviar por WhatsApp" });
  await expect(whatsappLink).toBeVisible({ timeout: 45_000 });

  // PostgreSQL devuelve lo mismo que calculó la app, sin perder precisión.
  await expect.poll(async () => (await rows(user, "budget_items")).length).toBe(2);
  const [budget] = await rows<{ id: string; number: number; total: number }>(user, "budgets");
  expect(budget).toMatchObject({ number: 1, total: 109145.15, subtotal_labor: 85000, subtotal_materials: 5202.6, iva_amount: 18942.55, iva_percent: 21, advance_percent: 50 });
  const items = await rows(user, "budget_items");
  expect(items.find((item) => item.type === "material")).toMatchObject({ quantity: 4, cost_price: 1000.5, markup_percent: 30, unit_price: 1300.65, total: 5202.6 });

  // El link firmado de WhatsApp baja el PDF real sin sesión.
  const href = await whatsappLink.getAttribute("href");
  const signedUrl = decodeURIComponent(href!).match(/https?:\/\/\S+token=\S+/)?.[0];
  expect(signedUrl, "el mensaje de WhatsApp incluye el link al PDF").toBeTruthy();
  const shared = await fetch(signedUrl!);
  expect(shared.status).toBe(200);
  expect(shared.headers.get("content-type")).toContain("application/pdf");
  const pdf = Buffer.from(await shared.arrayBuffer());
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(5000); // Con logo incrustado.

  // Y sin firma el archivo no es accesible.
  const [pdfRow] = await rows<{ url: string }>(user, "budget_pdfs");
  const unsigned = await fetch(`${API}/storage/v1/object/public/pdfs/${pdfRow.url}`);
  expect(unsigned.ok).toBe(false);

  // Editar conserva el número; duplicar toma el siguiente (el upsert no quema correlativos).
  await page.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await page.waitForURL("**/presupuestos/editar?id=**");
  await page.getByLabel("Notas").fill("Incluye retiro del equipo viejo");
  await page.getByRole("button", { name: "Generar PDF" }).click();
  await expect(page.getByRole("heading", { name: "Nº 1" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp" })).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => (await rows<{ notes: string }>(user, "budgets"))[0].notes).toBe("Incluye retiro del equipo viejo");

  await page.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("menuitem", { name: "Duplicar" }).click();
  await page.waitForURL("**/presupuestos/editar?id=**");
  await page.getByRole("button", { name: "Generar PDF" }).click();
  await expect(page.getByRole("heading", { name: "Nº 2" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp" })).toBeVisible({ timeout: 45_000 });

  // Borrar el duplicado limpia filas y archivo.
  const duplicate = (await rows<{ id: string; number: number }>(user, "budgets")).find((row) => row.number === 2)!;
  await expect.poll(async () => (await rows<{ budget_id: string }>(user, "budget_pdfs")).filter((row) => row.budget_id === duplicate.id).length).toBe(1);
  const [duplicatePdf] = (await rows<{ budget_id: string; url: string }>(user, "budget_pdfs")).filter((row) => row.budget_id === duplicate.id);
  await page.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("menuitem", { name: "Eliminar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Eliminar" }).click();
  await page.waitForURL("**/presupuestos");
  await expect.poll(async () => (await rows(user, "budgets")).length).toBe(1);
  expect((await user.storage.from("pdfs").download(duplicatePdf.url)).error).not.toBeNull();

  // Trabajo y fotos.
  await page.getByText("José Fernández").first().click();
  await page.getByRole("button", { name: "Aceptado" }).click();
  await page.getByRole("button", { name: "Pasar a trabajo" }).click();
  await page.waitForURL("**/trabajos/ver**");
  await page.getByRole("radio", { name: "En curso" }).click();
  await page.getByLabel("Inicio").fill("2026-11-10");
  await page.getByTestId("photo-input").setInputFiles("public/icons/icon-512.png");
  await expect(page.getByAltText("Foto del trabajo")).toBeVisible();

  await expect.poll(async () => (await rows(user, "job_photos")).length).toBe(1);
  await expect.poll(async () => (await rows<{ status: string; start_date: string }>(user, "jobs"))[0]).toMatchObject({ status: "in_progress", start_date: "2026-11-10" });
  const [photo] = await rows<{ url: string }>(user, "job_photos");
  await expect.poll(async () => (await user.storage.from("job-photos").download(photo.url)).error).toBeNull();

  // Al reabrir, la foto llega por URL firmada, no desde el celular.
  await page.reload();
  await expect.poll(() => page.getByAltText("Foto del trabajo").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await page.getByAltText("Foto del trabajo").getAttribute("src")).toContain("/object/sign/job-photos/");
  await shot(page, "real-trabajo");

  await page.getByRole("button", { name: "Eliminar foto" }).click();
  await expect.poll(async () => (await rows(user, "job_photos")).length).toBe(0);
  await expect.poll(async () => (await user.storage.from("job-photos").download(photo.url)).error).not.toBeNull();

  // No queda nada trabado en el outbox.
  await page.getByRole("link", { name: "Perfil" }).click();
  await expect(page.getByText("Cambios sin guardar en el servidor")).toHaveCount(0);

  // Otro usuario, con credenciales reales, no llega a nada de lo anterior.
  const otherEmail = uniqueEmail("intruso");
  const other = newClient();
  expect((await other.auth.signUp({ email: otherEmail, password: PASSWORD })).error).toBeNull();
  expect(await rows(other, "budgets")).toHaveLength(0);
  expect(await rows(other, "clients")).toHaveLength(0);
  expect(await rows(other, "oficios")).toHaveLength(45);
  expect((await other.storage.from("pdfs").download(pdfRow.url)).error).not.toBeNull();
  expect((await other.storage.from("pdfs").createSignedUrl(pdfRow.url, 60)).error).not.toBeNull();
  const intrusion = await other.storage.from("pdfs").upload(`${(await user.auth.getUser()).data.user!.id}/falso.pdf`, new Blob(["x"], { type: "application/pdf" }));
  expect(intrusion.error).not.toBeNull();

  // Los límites del bucket de logos los aplica el servidor, no solo la UI.
  const otherId = (await other.auth.getUser()).data.user!.id;
  const wrongType = await other.storage.from("logos").upload(`${otherId}/a.pdf`, new Blob(["x"], { type: "application/pdf" }), { contentType: "application/pdf" });
  expect(wrongType.error).not.toBeNull();
  const tooBig = await other.storage.from("logos").upload(`${otherId}/b.png`, new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: "image/png" }), { contentType: "image/png" });
  expect(tooBig.error).not.toBeNull();

  expect(errors).toEqual([]);
});

test("cae la API: se carga igual y al volver se sincroniza con número real", async ({ page, context }) => {
  const email = uniqueEmail("sinred");
  await registerAndOnboard(page, email);
  const user = await clientFor(email);
  await expect.poll(async () => (await rows<{ onboarded_at: string | null }>(user, "professionals"))[0]?.onboarded_at).toBeTruthy();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  execSync(`docker stop ${KONG}`, { stdio: "ignore" });
  try {
    await page.goto("/presupuestos/editar");
    await createClientInBudget(page, "María Offline", "351 234 5678");
    await addLaborLine(page, "Reparación sin señal", "10000");
    await page.getByRole("button", { name: "Generar PDF" }).click();
    await page.waitForURL("**/presupuestos/ver**");
    await expect(page.getByRole("heading", { name: "Sin número" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Enviar por WhatsApp" })).toBeVisible({ timeout: 45_000 });
  } finally {
    execSync(`docker start ${KONG}`, { stdio: "ignore" });
  }

  // Kong tarda unos segundos en volver a atender.
  await expect.poll(async () => {
    try {
      return (await fetch(`${API}/auth/v1/health`, { headers: { apikey: ANON_KEY } })).ok;
    } catch {
      return false;
    }
  }, { timeout: 60_000 }).toBe(true);

  await context.setOffline(true);
  await context.setOffline(false); // Dispara el evento "online", igual que cuando vuelve la señal.
  await expect(page.getByRole("heading", { name: "Nº 1" })).toBeVisible({ timeout: 30_000 });

  await expect.poll(async () => (await rows(user, "budget_pdfs")).length).toBe(1);
  expect(await rows(user, "clients")).toHaveLength(1);
  expect(await rows<{ number: number }>(user, "budgets")).toMatchObject([{ number: 1, total: 12100 }]);
  expect(await rows(user, "budget_items")).toHaveLength(1);
  const [pdf] = await rows<{ url: string }>(user, "budget_pdfs");
  expect((await user.storage.from("pdfs").download(pdf.url)).error).toBeNull();
});

test("recuperar la contraseña con el mail real", async ({ page }) => {
  const email = uniqueEmail("olvido");
  const created = newClient();
  expect((await created.auth.signUp({ email, password: PASSWORD })).error).toBeNull();

  await page.goto("/recuperar");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("te llega un link")).toBeVisible();

  let link: string | undefined;
  await expect.poll(async () => {
    const search = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const id = search.messages?.[0]?.ID;
    if (!id) return false;
    const message = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
    link = String(message.Text).match(/https?:\/\/\S+verify\S+/)?.[0];
    return Boolean(link);
  }, { timeout: 30_000 }).toBe(true);

  await page.goto(link!);
  await page.waitForURL("**/nueva-clave**");
  await page.getByLabel("Contraseña nueva").fill("otra-clave-segura");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForURL(/\/(panel|onboarding)/);

  expect((await newClient().auth.signInWithPassword({ email, password: "otra-clave-segura" })).error).toBeNull();
  expect((await newClient().auth.signInWithPassword({ email, password: PASSWORD })).error).not.toBeNull();
});
