"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { db } from "@/lib/db";
import { contrastColor, isValidHexColor } from "@/lib/format";

/** Aplica el color de marca del profesional a toda la app. */
export function BrandTheme() {
  const color = useLiveQuery(async () => (await db.professionals.toCollection().first())?.primary_color);

  useEffect(() => {
    const root = document.documentElement;
    if (!color || !isValidHexColor(color)) return;
    root.style.setProperty("--primary", color);
    root.style.setProperty("--primary-foreground", contrastColor(color));
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--primary-foreground");
    };
  }, [color]);

  return null;
}
