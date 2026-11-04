import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = "http://localhost:54321";
const SHOTS = "test-results/screens";

type BackendState = Record<string, Record<string, unknown>[]> & { files: string[] };

async function backend(page: Page): Promise<BackendState> {
  return (await page.request.get(`${API}/__state`)).json();
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function registerAndOnboard(page: Page) {
  await page.goto("/registro");
  await page.getByLabel("Email").fill("carlos@ejemplo.com");
  await page.getByLabel("Contraseña").fill("clave-de-prueba");
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("Falta tu nombre.")).toBeVisible();
  await page.getByLabel("Nombre", { exact: true }).fill("Carlos");
  await page.getByLabel("Apellido").fill("Peña");
  await page.getByLabel("Teléfono").fill("11 2345-6789");
  await page.getByLabel("Dirección").fill("Av. Rivadavia 1234");
  await page.getByLabel("Zona de trabajo").fill("Zona Oeste");
  await shot(page, "onboarding-1");
  await page.getByRole("button", { name: "Siguiente" }).click();

  await page.getByTestId("logo-input").setInputFiles("public/icons/icon-192.png");
  await expect(page.getByAltText("Tu logo")).toBeVisible();
  await page.getByLabel("Nombre de fantasía o marca").fill("Plomería Don Carlos");
  await page.getByRole("button", { name: "Color #0F766E" }).click();
  await page.getByLabel("Texto al pie del presupuesto").fill("Garantía por escrito. Materiales de primera marca.");
  await shot(page, "onboarding-2");
  await page.getByRole("button", { name: "Siguiente" }).click();

  await expect(page.getByRole("button", { name: "Colocador de toldos" })).toBeVisible();
  expect(await page.locator('button[aria-pressed]').count()).toBe(45);
  await page.getByRole("button", { name: "Plomero" }).click();
  await page.getByRole("button", { name: "Gasista matriculado" }).click();
  await page.getByPlaceholder("Nombre del oficio").fill("Instalador de biodigestores");
  await page.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByRole("button", { name: "Instalador de biodigestores" })).toHaveAttribute("aria-pressed", "true");
  await shot(page, "onboarding-3");
  await page.getByRole("button", { name: /Terminar/ }).click();
  await page.waitForURL("**/panel");
  await expect(page.getByRole("heading", { name: "Plomería Don Carlos" })).toBeVisible();
}

async function createClientInBudget(page: Page, name: string, phone: string) {
  await page.getByRole("button", { name: "Elegir o crear cliente" }).click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Teléfono").fill(phone);
  await page.getByLabel("Dirección").fill("Calle Falsa 123");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Cambiar" })).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await request.post(`${API}/__reset`);
});

test("del registro al PDF, la agenda y las fotos", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await registerAndOnboard(page);
  await shot(page, "panel-vacio");

  // El perfil, los oficios y el logo llegaron al servidor.
  await expect.poll(async () => (await backend(page)).professionals[0].onboarded_at).toBeTruthy();
  let state = await backend(page);
  expect(state.professional_oficios).toHaveLength(3);
  expect(state.oficios).toHaveLength(46);
  expect(state.files.some((file) => file.startsWith("logos/"))).toBe(true);
  expect(state.professionals[0].primary_color).toBe("#0F766E");

  // Presupuesto nuevo.
  await page.getByRole("link", { name: "Nuevo presupuesto" }).click();
  await page.waitForURL("**/presupuestos/editar");
  await page.getByRole("button", { name: "Generar PDF" }).click();
  await expect(page.getByText("Elegí un cliente.")).toBeVisible();

  await createClientInBudget(page, "José Fernández", "011 15 2345-6789");

  await page.getByRole("button", { name: "+ Plomero" }).click();
  const labor = page.locator("section", { hasText: "Mano de obra" }).locator("li").first();
  await labor.getByLabel("Descripción").fill("Instalación de termotanque");
  await labor.getByLabel("Precio unitario").fill("85.000");

  await page.getByRole("button", { name: "Agregar material" }).click();
  const material = page.locator("section", { hasText: "Materiales" }).locator("li").first();
  await material.getByLabel("Descripción").fill("Caño termofusión 1/2");
  await material.locator("input").nth(1).fill("4");
  await material.getByLabel("Costo unitario").fill("1.000,50");
  await expect(material.getByLabel("Markup")).toHaveValue("30");
  await material.getByLabel("Descripción").click(); // Sale del campo para reformatear.

  // 85.000 + 4 × 1.300,65 = 90.202,60 + 21% = 109.145,15
  await expect(page.getByTestId("budget-total")).toHaveText("$ 109.145,15");
  await expect(page.getByText("Tu ganancia en materiales")).toContainText("$ 1.200,60");

  await page.getByRole("radio", { name: "10,5%" }).click();
  await expect(page.getByTestId("budget-total")).toHaveText("$ 99.673,87");
  await page.getByRole("radio", { name: "21%" }).click();

  await page.getByLabel("Anticipo %").fill("50");
  await page.getByLabel("Forma de pago").fill("Transferencia");
  await shot(page, "editor");

  await page.getByRole("button", { name: "Vista previa" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Instalación de termotanque")).toBeVisible();
  await expect(dialog).toContainText("$ 109.145,15");
  await expect(dialog).toContainText("1.300,65");
  // El cliente no debe ver el costo ni la ganancia.
  await expect(dialog).not.toContainText("1.000,50");
  await expect(dialog).not.toContainText("Markup");
  await shot(page, "vista-previa");
  // El logo tiene que verse de verdad, no como imagen rota.
  await expect.poll(() => dialog.locator("header img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Generar PDF" }).click();
  await page.waitForURL("**/presupuestos/ver**");
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Nº 1" })).toBeVisible();
  await shot(page, "detalle");

  const whatsapp = await page.getByRole("link", { name: "Enviar por WhatsApp" }).getAttribute("href");
  expect(whatsapp).toContain("https://wa.me/5491123456789?text=");
  const message = decodeURIComponent(whatsapp!.split("text=")[1]);
  expect(message).toContain("Hola José");
  expect(message).toContain("Nº 1");
  expect(message).toContain("$ 109.145,15");
  expect(message).toContain("/storage/v1/object/sign/pdfs/");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Presupuesto-1-Jose-Fernandez.pdf");
  const pdfPath = join("test-results", download.suggestedFilename());
  await download.saveAs(pdfPath);
  const pdf = readFileSync(pdfPath);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(5000);

  await expect.poll(async () => (await backend(page)).budget_pdfs.length).toBe(1);
  state = await backend(page);
  expect(state.budgets[0]).toMatchObject({ number: 1, total: 109145.15, subtotal_labor: 85000, subtotal_materials: 5202.6, iva_amount: 18942.55 });
  expect(state.budget_items).toHaveLength(2);
  expect(state.budget_items.find((item) => item.type === "material")).toMatchObject({ cost_price: 1000.5, markup_percent: 30, unit_price: 1300.65, total: 5202.6 });
  expect(state.files.some((file) => file.startsWith("pdfs/"))).toBe(true);

  // Aceptado -> trabajo -> agenda.
  await page.getByRole("button", { name: "Aceptado" }).click();
  await page.getByRole("button", { name: "Pasar a trabajo" }).click();
  await page.waitForURL("**/trabajos/ver**");
  await page.getByRole("radio", { name: "En curso" }).click();
  await page.getByLabel("Inicio").fill("2026-11-10");
  await page.getByLabel("Fin estimado").fill("2026-11-12");
  await page.getByLabel("Notas").fill("Llave en portería");
  await page.getByLabel("Notas").blur();
  await expect(page.getByText("Notas guardadas")).toBeVisible();

  await page.getByTestId("photo-input").setInputFiles("public/icons/icon-512.png");
  await expect(page.getByAltText("Foto del trabajo")).toBeVisible();
  await expect.poll(async () => (await backend(page)).files.filter((file) => file.startsWith("job-photos/")).length).toBe(1);
  await shot(page, "trabajo");

  // La foto se sigue viendo al volver a abrir, ya desde el servidor.
  await page.reload();
  await expect(page.getByAltText("Foto del trabajo")).toBeVisible();
  await expect.poll(() => page.getByAltText("Foto del trabajo").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Trabajos" }).click();
  await expect(page.getByText("José Fernández")).toBeVisible();
  await page.getByRole("button", { name: "Cobrado" }).click();
  await expect(page.getByText("Ningún trabajo coincide")).toBeVisible();
  await page.getByRole("button", { name: "En curso" }).click();
  await expect(page.getByText("José Fernández")).toBeVisible();
  await page.getByLabel("Inicio desde").fill("2026-12-01");
  await expect(page.getByText("Ningún trabajo coincide")).toBeVisible();
  await page.getByLabel("Inicio desde").fill("2026-11-01");
  await expect(page.getByText("José Fernández")).toBeVisible();
  await shot(page, "trabajos");

  // Duplicar da número nuevo y no toca el original.
  await page.getByRole("link", { name: "Presupuestos" }).click();
  await page.getByRole("button", { name: "Duplicar" }).click();
  await page.waitForURL("**/presupuestos/editar?id=**");
  await page.getByRole("button", { name: "Generar PDF" }).click();
  await expect(page.getByRole("heading", { name: "Nº 2" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp" })).toBeVisible({ timeout: 45_000 });

  await page.getByRole("link", { name: "Presupuestos" }).click();
  await page.getByPlaceholder("Buscar por cliente o número").fill("José");
  await expect(page.getByRole("button", { name: "Duplicar" })).toHaveCount(2);
  await page.getByRole("button", { name: "Aceptado" }).click();
  await expect(page.getByRole("button", { name: "Duplicar" })).toHaveCount(1);
  await shot(page, "presupuestos");

  await page.getByRole("link", { name: "Historial de PDFs" }).click();
  await expect(page.getByText("Presupuesto-1-Jose-Fernandez.pdf")).toBeVisible();
  await expect(page.getByText("Presupuesto-2-Jose-Fernandez.pdf")).toBeVisible();

  await page.getByRole("link", { name: "Clientes" }).click();
  await expect(page.getByText("2 presupuestos")).toBeVisible();
  await page.getByText("José Fernández").click();
  await page.getByRole("button", { name: "Eliminar cliente" }).click();
  await expect(page.getByText("Tiene presupuestos cargados")).toBeVisible();
  await shot(page, "clientes");
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Inicio" }).click();
  await expect(page.getByText("Próximos trabajos")).toBeVisible();
  await shot(page, "panel");

  // Otro login en el mismo equipo no ve datos del anterior.
  await page.getByRole("link", { name: "Perfil" }).click();
  await shot(page, "perfil");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.waitForURL("**/login");
  const keys = await page.evaluate(async () => {
    const open = indexedDB.open("presupuestapp");
    const database = await new Promise<IDBDatabase>((resolve) => { open.onsuccess = () => resolve(open.result); });
    const store = database.transaction("clients").objectStore("clients");
    const count = store.count();
    return new Promise<number>((resolve) => { count.onsuccess = () => resolve(count.result); });
  });
  expect(keys).toBe(0);

  await page.getByLabel("Email").fill("carlos@ejemplo.com");
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
  await page.getByLabel("Contraseña").fill("clave-de-prueba");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/panel");
  await expect(page.getByText("Próximos trabajos")).toBeVisible();

  expect(errors).toEqual([]);
  void context;
});

test("sin conexión: abre, guarda, genera el PDF y sincroniza al volver", async ({ page, context }) => {
  await registerAndOnboard(page);

  // Esperar a que el service worker tome control: recién ahí la app abre offline.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(async () => (await backend(page)).professionals[0].onboarded_at).toBeTruthy();
  // Que el logo haya llegado a la caché local para el PDF.
  await expect.poll(() => page.evaluate(async () => {
    const open = indexedDB.open("presupuestapp");
    const database = await new Promise<IDBDatabase>((resolve) => { open.onsuccess = () => resolve(open.result); });
    const request = database.transaction("kv").objectStore("kv").get("logo");
    return new Promise<boolean>((resolve) => { request.onsuccess = () => resolve(Boolean(request.result)); });
  })).toBe(true);

  await page.request.get(`${API}/__network?up=0`);

  // Pantalla nunca visitada, con el servidor caído: tiene que venir del precache.
  await page.goto("/presupuestos/editar");
  // setOffline bloquea hasta las navegaciones que atiende el service worker, así que
  // se usa solo para ver el aviso; el resto del flujo corre con el servidor caído.
  await context.setOffline(true);
  await expect(page.getByText("Sin conexión. Podés seguir trabajando")).toBeVisible();
  await context.setOffline(false);
  await createClientInBudget(page, "María Offline", "351 234 5678");
  await page.getByRole("button", { name: "Agregar mano de obra" }).click();
  const labor = page.locator("section", { hasText: "Mano de obra" }).locator("li").first();
  await labor.getByLabel("Descripción").fill("Reparación sin señal");
  await labor.getByLabel("Precio unitario").fill("10000");
  await page.getByRole("button", { name: "Generar PDF" }).click();
  await page.waitForURL("**/presupuestos/ver**");
  await expect(page.getByRole("heading", { name: "Sin número" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp" })).toBeVisible({ timeout: 45_000 });
  await shot(page, "offline-detalle");

  const whatsapp = await page.getByRole("link", { name: "Enviar por WhatsApp" }).getAttribute("href");
  expect(whatsapp).toContain("wa.me/5493512345678");
  expect(decodeURIComponent(whatsapp!)).not.toContain("storage");

  // Nada llegó al servidor todavía.
  let state = await backend(page);
  expect(state.budgets).toHaveLength(0);
  expect(state.clients).toHaveLength(0);

  // Recargar con el servidor caído no pierde nada.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sin número" })).toBeVisible();

  // Vuelve la señal: el evento "online" dispara la sincronización.
  await page.request.get(`${API}/__network?up=1`);
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "Nº 1" })).toBeVisible({ timeout: 20_000 });

  await expect.poll(async () => (await backend(page)).budget_pdfs.length).toBe(1);
  state = await backend(page);
  expect(state.clients).toHaveLength(1);
  expect(state.budgets).toHaveLength(1);
  expect(state.budget_items).toHaveLength(1);
  expect(state.files.filter((file) => file.startsWith("pdfs/"))).toHaveLength(1);
});
