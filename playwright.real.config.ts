import { execSync } from "node:child_process";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Corre e2e/real contra el Supabase local. Requiere `npx supabase start`.
const status = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^(\w+)="?([^"\r]*)"?/);
      return match ? [[match[1], match[2]]] : [];
    }),
);

process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;

export default defineConfig({
  ...base,
  testDir: "./e2e/real",
  testIgnore: [],
  webServer: {
    command: "npx next build && node e2e/fake-backend.mjs",
    url: "http://localhost:3100/login",
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      E2E_APP_ONLY: "1",
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    },
  },
});
