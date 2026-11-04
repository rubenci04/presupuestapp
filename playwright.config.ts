import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "real/**",
  workers: 1, // Comparten el backend de prueba en memoria.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://localhost:3100",
    channel: "chrome",
    acceptDownloads: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx next build && node e2e/fake-backend.mjs",
    url: "http://localhost:3100/login",
    timeout: 240_000,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "clave-de-prueba",
    },
  },
});
