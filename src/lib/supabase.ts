import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

// Perezoso: las páginas se prerenderizan en el build, sin variables ni navegador.
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver README).");
    }
    client = createClient(url, key);
  }
  return client;
}

export const BUCKETS = { logos: "logos", pdfs: "pdfs", photos: "job-photos" } as const;
