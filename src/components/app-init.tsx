"use client";

import { useEffect } from "react";
import { ensureCatalog } from "@/lib/catalog";

/** Se ejecuta al abrir la app, en cualquier pantalla. */
export function AppInit() {
  useEffect(() => {
    // Pide que el navegador no borre los datos cuando el celular se queda sin espacio.
    void navigator.storage?.persist?.().catch(() => undefined);
    void ensureCatalog();
  }, []);
  return null;
}
