"use client";

import { Calculator, FileCheck2, Share2, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";

const FEATURES = [
  { icon: FileCheck2, title: "Con tu logo y tus datos", text: "Presupuestos que parecen de empresa, no un mensaje de WhatsApp." },
  { icon: Calculator, title: "Materiales con tu ganancia", text: "Cargás el costo y el margen. El cliente ve solo el precio final." },
  { icon: Share2, title: "PDF directo a WhatsApp", text: "Lo generás en la obra y lo mandás en el momento." },
  { icon: WifiOff, title: "Anda sin señal", text: "Seguís trabajando sin conexión y se sincroniza solo después." },
];

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace("/panel");
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pt-14 pb-8">
      <p className="text-sm font-bold tracking-wide text-primary">PresupuestApp</p>
      <h1 className="mt-3 text-[2.5rem] leading-[1.05] font-extrabold tracking-tight">
        Presupuestos profesionales en 1 minuto, con tu marca
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Para plomeros, gasistas, electricistas, herreros, carpinteros, albañiles y todos los oficios.
      </p>

      <ul className="mt-8 flex-1 space-y-5">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 space-y-3">
        <Button asChild size="lg" className="w-full">
          <Link href="/registro">Crear cuenta gratis</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href="/login">Ya tengo cuenta</Link>
        </Button>
      </div>
    </main>
  );
}
