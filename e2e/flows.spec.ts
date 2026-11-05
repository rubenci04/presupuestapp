import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = "http://localhost:3100";
const SHOTS = "test-results/screens";

// Las capturas son solo para mirar a mano: si una falla (por ejemplo, en plena navegación), el test sigue.
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => undefined);
const network = (page: Page, up: boolean) => page.request.get(`${APP}/__network?up=${up ? 1 : 0}`);

/** En un celular, que algo se salga de la pantalla hace que el navegador achique todo. */
async function expectNoHorizontalScroll(page: Page, where: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth, `${where} se sale de la pantalla (${scrollWidth}px en ${innerWidth}px)`).toBeLessThanOrEqual(innerWidth);
}

/** Registra todo lo que sale de la app y falla si algo va a un servidor que no es el suyo. */
function watchRequests(page: Page) {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(APP) && !url.startsWith("data:") && !url.startsWith("blob:")) external.push(url);
  });
  return external;
}

async function welcome(page: Page, name = "Plomería Don Carlos") {
  await page.goto("/");
  await page.waitForURL("**/bienvenida");
  await page.getByLabel("Tu nombre o el de tu negocio").fill(name);
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.waitForURL("**/presupuestos/editar");
}

async function addClient(page: Page, name: string, phone: string) {
  await page.getByRole("button", { name: "Elegir o crear cliente" }).click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Teléfono").fill(phone);
  await page.getByLabel("Dirección").fill("Calle Falsa 123");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Cambiar" })).toBeVisible();
}

async function addLabor(page: Page, description: string, price: string) {
  await page.getByRole("button", { name: "Agregar mano de obra" }).click();
  const line = page.locator("section", { hasText: "Mano de obra" }).locator("li").last();
  await line.getByLabel("Descripción").fill(description);
  await line.getByLabel("Precio unitario").fill(price);
}

test.beforeEach(async ({ request }) => {
  await request.get(`${APP}/__network?up=1`);
});

test("primer uso sin red: abrir, bienvenida, presupuesto y PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const external = watchRequests(page);

  // Se espía el menú de compartir, que en el celular adjunta el PDF.
  await page.addInitScript(() => {
    const shared: { names: string[]; types: string[]; text: string }[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: { files: File[]; text: string }) => {
        shared.push({ names: data.files.map((f) => f.name), types: data.files.map((f) => f.type), text: data.text });
      },
    });
  });

  // "/" abre la app sin pedir login: la primera vez cae en la bienvenida.
  await page.goto("/");
  await page.waitForURL("**/bienvenida");
  await expect(page.getByRole("heading", { name: "¡Bienvenido a PresupuestApp!" })).toBeVisible();
  await expect(page.getByText(/iniciar sesión|registr|contraseña/i)).toHaveCount(0);
  await expectNoHorizontalScroll(page, "la bienvenida");
  await shot(page, "bienvenida");

  // Con el service worker ya activo, se corta la red del todo.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await network(page, false);
  await page.reload();
  await expect(page.getByRole("heading", { name: "¡Bienvenido a PresupuestApp!" })).toBeVisible();

  // Falta el nombre: avisa y no avanza.
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page.getByText("Escribí tu nombre o el de tu negocio.")).toBeVisible();
  await expect(page).toHaveURL(/bienvenida/);

  await page.getByLabel("Tu nombre o el de tu negocio").fill("Plomería Don Carlos");
  await page.getByLabel("Tu teléfono").fill("11 2345-6789");
  await page.getByPlaceholder(/^Buscar/).fill("plom");
  await expect(page.getByRole("radio", { name: "Plomero" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Electricista" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Plomero" }).click();
  await page.getByRole("button", { name: "Color #0F766E" }).click();
  await page.getByTestId("logo-input").setInputFiles("public/icons/icon-192.png");
  await expect(page.getByAltText("Tu logo")).toBeVisible();
  await shot(page, "bienvenida-completa");
  await page.getByRole("button", { name: "Empezar" }).click();

  // Directo a "Nuevo presupuesto".
  await page.waitForURL("**/presupuestos/editar");
  await expect(page.getByRole("heading", { name: "Nuevo presupuesto" })).toBeVisible();

  await addClient(page, "José Fernández", "011 15 2345-6789");
  // El oficio elegido aparece como atajo de mano de obra.
  await page.getByRole("button", { name: "+ Plomero" }).click();
  const labor = page.locator("section", { hasText: "Mano de obra" }).locator("li").first();
  await labor.getByLabel("Descripción").fill("Instalación de termotanque");
  await labor.getByLabel("Precio unitario").fill("85.000");

  await page.getByRole("button", { name: "Agregar material" }).click();
  const material = page.locator("section", { hasText: "Materiales" }).locator("li").first();
  await material.getByLabel("Descripción").fill("Caño termofusión 1/2");
  await material.locator("input").nth(1).fill("4");
  await material.getByLabel("Lo que te cuesta").fill("1.000,50");
  await expect(material.getByLabel("Tu ganancia")).toHaveValue("30");
  await material.getByLabel("Descripción").click();
  await expect(page.getByTestId("budget-total")).toHaveText("$ 109.145,15");
  await expectNoHorizontalScroll(page, "el editor");
  await shot(page, "editor");

  await page.getByRole("button", { name: "Vista previa" }).click();
  const preview = page.getByRole("dialog");
  await expect(preview).toContainText("$ 109.145,15");
  await expect(preview).not.toContainText("1.000,50"); // El costo no lo ve el cliente.
  await expect.poll(() => preview.locator("header img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Armar PDF" }).click();
  await page.waitForURL("**/presupuestos/ver**");
  // El número es local y correlativo: nunca "Sin número".
  await expect(page.getByRole("heading", { name: "Nº 1" })).toBeVisible({ timeout: 45_000 });
  const whatsapp = page.getByRole("button", { name: "Enviar por WhatsApp" });
  await expect(whatsapp).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Sin número")).toHaveCount(0);
  await expectNoHorizontalScroll(page, "el presupuesto");
  await shot(page, "pdf-listo");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Presupuesto-1-Jose-Fernandez.pdf");
  const pdfPath = join("test-results", file.suggestedFilename());
  await file.saveAs(pdfPath);
  const pdf = readFileSync(pdfPath);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(5000); // Lleva el logo adentro.

  // Compartir: el PDF viaja adjunto, con el mensaje para el cliente.
  await whatsapp.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length)).toBe(1);
  const [shared] = await page.evaluate(() => (window as unknown as { __shared: { names: string[]; types: string[]; text: string }[] }).__shared);
  expect(shared.names).toEqual(["Presupuesto-1-Jose-Fernandez.pdf"]);
  expect(shared.types).toEqual(["application/pdf"]);
  expect(shared.text).toContain("Hola José");
  expect(shared.text).toContain("$ 109.145,15");
  await expect(page.getByText("Enviado")).toBeVisible();

  // Se queda todo guardado: recargar sin red no pierde nada.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Nº 1" })).toBeVisible();

  // Un segundo presupuesto sigue la numeración.
  await page.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("menuitem", { name: "Duplicar" }).click();
  await page.waitForURL("**/presupuestos/editar?id=**");
  await page.getByRole("button", { name: "Armar PDF" }).click();
  await expect(page.getByRole("heading", { name: "Nº 2" })).toBeVisible({ timeout: 45_000 });

  await page.getByRole("link", { name: "Inicio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plomería Don Carlos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ajustes" })).toBeVisible();
  await expectNoHorizontalScroll(page, "el inicio");
  await shot(page, "inicio");

  // Todo pasó sin red y sin hablar con ningún servidor.
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("trabajos, fotos y copia de seguridad: guardar, perder todo y recuperar", async ({ page }) => {
  const external = watchRequests(page);
  await welcome(page);
  await addClient(page, "María López", "351 234 5678");
  await addLabor(page, "Reparación", "10000");
  await page.getByRole("button", { name: "Armar PDF" }).click();
  await expect(page.getByRole("link", { name: "Enviar por WhatsApp" }).or(page.getByRole("button", { name: "Enviar por WhatsApp" }))).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "Lo aceptó", exact: true }).click();
  await page.getByRole("button", { name: "Pasar a trabajo" }).click();
  await page.waitForURL("**/trabajos/ver**");
  await page.getByRole("radio", { name: "En curso" }).click();
  await page.getByLabel("Notas").fill("Llave en portería");
  await page.getByLabel("Notas").blur();
  await page.getByTestId("photo-input").setInputFiles("public/icons/icon-512.png");
  await expect(page.getByAltText("Foto del trabajo")).toBeVisible();
  await expect.poll(() => page.getByAltText("Foto del trabajo").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // Ajustes: la copia de seguridad.
  await page.goto("/perfil");
  await expect(page.getByRole("heading", { name: "Copia de seguridad" })).toBeVisible();
  await expect(page.getByText("Todavía no hiciste ninguna copia.")).toBeVisible();
  await expectNoHorizontalScroll(page, "ajustes");
  await shot(page, "ajustes");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Guardar copia" }).click();
  const backup = await download;
  expect(backup.suggestedFilename()).toMatch(/^PresupuestApp-copia-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPath = join("test-results", backup.suggestedFilename());
  await backup.saveAs(backupPath);
  await expect(page.getByText(/Última copia:/)).toBeVisible();

  // Un archivo cualquiera no se acepta y no toca los datos.
  await page.getByTestId("restore-input").setInputFiles({ name: "cualquiera.json", mimeType: "application/json", buffer: Buffer.from("hola") });
  await page.getByRole("button", { name: "Sí, recuperar" }).click();
  await expect(page.getByText("Ese archivo no es una copia de PresupuestApp.")).toBeVisible();

  // Se pierde todo (como desinstalar la app o borrar los datos del navegador).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("presupuestapp");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
      }),
  );
  await page.goto("/");
  await page.waitForURL("**/bienvenida");

  // Desde la bienvenida se recupera la copia.
  await page.getByTestId("restore-input").setInputFiles(backupPath);
  await page.waitForURL("**/panel");
  await expect(page.getByRole("heading", { name: "Plomería Don Carlos" })).toBeVisible();

  await page.getByRole("link", { name: "Trabajos", exact: true }).click();
  await page.waitForURL("**/trabajos");
  await page.getByText("María López").click();
  await expect(page.getByLabel("Notas")).toHaveValue("Llave en portería");
  await expect(page.getByRole("radio", { name: "En curso" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByAltText("Foto del trabajo")).toBeVisible();
  await expect.poll(() => page.getByAltText("Foto del trabajo").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // El PDF del historial también volvió, y la numeración sigue donde estaba.
  await page.getByRole("link", { name: "Presupuestos", exact: true }).click();
  await page.getByRole("link", { name: "Historial de PDFs" }).click();
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Descargar Presupuesto-1/ }).click();
  expect((await pdfDownload).suggestedFilename()).toBe("Presupuesto-1-Maria-Lopez.pdf");

  await page.getByRole("link", { name: "Inicio", exact: true }).click();
  await page.getByRole("link", { name: "Nuevo presupuesto" }).click();
  await page.getByRole("button", { name: "Elegir o crear cliente" }).or(page.getByRole("button", { name: "Cambiar" })).first().waitFor();
  expect(external).toEqual([]);
});

test("el aviso de copia de seguridad es suave y se puede dejar para más tarde", async ({ page }) => {
  await welcome(page);
  await addClient(page, "Pedro", "11 5555-5555");
  await addLabor(page, "Arreglo", "5000");
  await page.getByRole("button", { name: "Armar PDF" }).click();
  await expect(page.getByRole("heading", { name: "Nº 1" })).toBeVisible({ timeout: 45_000 });

  // Recién empezó: no molesta.
  await page.goto("/panel");
  await expect(page.getByRole("heading", { name: "Plomería Don Carlos" })).toBeVisible();
  await expect(page.getByText("Hacé una copia de seguridad")).toHaveCount(0);

  // Pasó más de una semana de uso sin copias.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("presupuestapp");
        open.onsuccess = () => {
          const database = open.result;
          const store = database.transaction("professionals", "readwrite").objectStore("professionals");
          const all = store.getAll();
          all.onsuccess = () => {
            const row = all.result[0];
            row.created_at = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString();
            store.put(row).onsuccess = () => resolve();
          };
        };
      }),
  );
  await page.reload();
  await expect(page.getByText("Hacé una copia de seguridad")).toBeVisible();
  await shot(page, "aviso-copia");

  await page.getByRole("button", { name: "Más tarde" }).click();
  await expect(page.getByText("Hacé una copia de seguridad")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Hacé una copia de seguridad")).toHaveCount(0);

  // Y la ruta de login ya no está en el flujo: si alguien la abre, no pasa nada raro.
  await page.goto("/login");
  await expect(page.getByText("La cuenta todavía no está disponible")).toBeVisible();
});

test("en un celular angosto (360 px) nada se sale de la pantalla", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await page.waitForURL("**/bienvenida");
  await expectNoHorizontalScroll(page, "la bienvenida");
  await shot(page, "angosto-bienvenida");
  await page.getByLabel("Tu nombre o el de tu negocio").fill("Plomería Don Carlos");
  await page.getByRole("button", { name: "Empezar" }).click();
  await page.waitForURL("**/presupuestos/editar");

  for (const path of ["/presupuestos/editar", "/panel", "/presupuestos", "/clientes", "/trabajos", "/perfil"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await expectNoHorizontalScroll(page, path);
  }

  // Las etiquetas de la barra de abajo entran enteras, sin cortarse.
  await page.goto("/panel");
  const links = page.locator("nav a");
  await expect(links).toHaveCount(4);
  for (const link of await links.all()) {
    const fits = await link.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits, `la etiqueta "${await link.innerText()}" se corta`).toBe(true);
  }
  await shot(page, "angosto-inicio");
});
