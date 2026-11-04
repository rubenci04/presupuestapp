"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BrandFields,
  brandErrors,
  OficiosPicker,
  PersonalFields,
  personalErrors,
  type BrandValues,
  type PersonalValues,
} from "@/components/profile-fields";
import { Button } from "@/components/ui/button";
import { getProfessional, saveProfile, setOficios } from "@/lib/data";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Tus datos", subtitle: "Van en cada presupuesto para que te contacten." },
  { title: "Tu marca", subtitle: "Así se van a ver tus presupuestos." },
  { title: "Tus oficios", subtitle: "Elegí todos los que hacés. Los usamos para cargar más rápido." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [personal, setPersonal] = useState<PersonalValues>({ name: "", last_name: "", phone: "", cuit: "", address: "", zone: "" });
  const [brand, setBrand] = useState<BrandValues>({ brand_name: "", primary_color: "#C2410C", footer_text: "", logo_url: null });
  const [oficios, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfessional().then((professional) => {
      // Si ya completó el onboarding en otro equipo, no hay nada que hacer acá.
      if (professional.onboarded_at) {
        router.replace("/panel");
        return;
      }
      // Google trae el nombre completo en un solo campo.
      const [first = "", ...rest] = professional.name.split(" ");
      setPersonal((values) => ({ ...values, name: first, last_name: professional.last_name || rest.join(" ") }));
    });
  }, [router]);

  function next() {
    const error = step === 0 ? personalErrors(personal) : step === 1 ? brandErrors(brand) : null;
    if (error) {
      toast.error(error);
      return;
    }
    window.scrollTo(0, 0);
    setStep(step + 1);
  }

  async function finish() {
    if (oficios.size === 0) {
      toast.error("Elegí al menos un oficio.");
      return;
    }
    setSaving(true);
    try {
      await setOficios([...oficios]);
      await saveProfile({
        ...personal,
        cuit: personal.cuit.trim() || null,
        ...brand,
        primary_color: brand.primary_color.toUpperCase(),
        onboarded_at: new Date().toISOString(),
      });
      toast.success("¡Listo! Ya podés armar tu primer presupuesto.");
      router.replace("/panel");
    } catch {
      setSaving(false);
      toast.error("No se pudo guardar. Probá de nuevo.");
    }
  }

  return (
    <main className="mx-auto max-w-lg px-5 pt-6 pb-28">
      <div className="flex gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
        {STEPS.map((_, index) => (
          <span key={index} className={cn("h-1.5 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-border")} />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Paso {step + 1} de {STEPS.length}
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight">{STEPS[step].title}</h1>
      <p className="mt-1 mb-6 text-muted-foreground">{STEPS[step].subtitle}</p>

      {step === 0 && <PersonalFields values={personal} onChange={setPersonal} />}
      {step === 1 && <BrandFields values={brand} onChange={setBrand} />}
      {step === 2 && <OficiosPicker selected={oficios} onChange={setSelected} />}

      <div className="fixed inset-x-0 bottom-0 border-t bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg gap-3">
          {step > 0 && (
            <Button variant="outline" size="lg" onClick={() => setStep(step - 1)} disabled={saving}>
              Atrás
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button size="lg" className="flex-1" onClick={next}>
              Siguiente
            </Button>
          ) : (
            <Button size="lg" className="flex-1" onClick={finish} disabled={saving}>
              Terminar{oficios.size > 0 ? ` (${oficios.size})` : ""}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
