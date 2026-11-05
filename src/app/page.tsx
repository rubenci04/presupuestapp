"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FullPageSpinner } from "@/components/app-shell";
import { db } from "@/lib/db";

/** No hay pantalla de login: "/" abre la app o, la primera vez, la bienvenida. */
export default function HomePage() {
  const router = useRouter();
  const professional = useLiveQuery(async () => (await db.professionals.toCollection().first()) ?? null, []);

  useEffect(() => {
    if (professional === undefined) return;
    router.replace(professional?.onboarded_at ? "/panel" : "/bienvenida");
  }, [professional, router]);

  return <FullPageSpinner />;
}
