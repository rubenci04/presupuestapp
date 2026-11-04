import { expect, type Page } from "@playwright/test";

const SHOTS = "test-results/screens";

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

export async function registerAndOnboard(page: Page, email = "carlos@ejemplo.com", password = "clave-de-prueba") {
  await page.goto("/registro");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
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
  expect(await page.locator("button[aria-pressed]").count()).toBe(45);
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

export async function createClientInBudget(page: Page, name: string, phone: string) {
  await page.getByRole("button", { name: "Elegir o crear cliente" }).click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Teléfono").fill(phone);
  await page.getByLabel("Dirección").fill("Calle Falsa 123");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Cambiar" })).toBeVisible();
}
