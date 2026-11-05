import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1, // Comparten el mismo servidor.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://localhost:3100",
    channel: "chrome",
    acceptDownloads: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx next build && node e2e/static-server.mjs",
    url: "http://localhost:3100/bienvenida",
    timeout: 240_000,
    reuseExistingServer: false,
    // Vacías a propósito: se compila SIN Supabase (aunque haya un .env.local) para probar
    // que la app no lo necesita. Las variables del entorno pisan a las de los .env.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
  },
});
