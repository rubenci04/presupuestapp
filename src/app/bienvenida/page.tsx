"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { restoreFromFile } from "@/components/backup-section";
import { ColorPicker, LogoPicker } from "@/components/profile-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCustomOficio, createLocalProfile, setOficios } from "@/lib/data";
import { db } from "@/lib/db";
import { contrastColor } from "@/lib/format";
import type { Oficio } from "@/lib/types";
import { cn } from "@/lib/utils";

const OTHER = "otro";

/** Única pantalla de bienvenida: se completa una sola vez, sin cuenta. */
export default function WelcomePage() {
  const router = useRouter();
  const professional = useLiveQuery(async () => (await db.professionals.toCollection().first()) ?? null, []);
  const oficios = useLiveQuery(() => db.oficios.filter((oficio) => oficio.professional_id === null).toArray(), [], [] as Oficio[]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [otherName, setOtherName] = useState("");
  const [color, setColor] = useState("#C2410C");
  const [logo, setLogo] = useState<Blob | null>(null);
  // Mientras se guarda, no hay que redirigir por el cambio del perfil.
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (professional?.onboarded_at && !busy) router.replace("/panel");
  }, [professional, busy, router]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return oficios
      .filter((oficio) => !term || oficio.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [oficios, search]);

  async function start() {
    if (!name.trim()) {
      toast.error("Escribí tu nombre o el de tu negocio.");
      nameInput.current?.focus();
      return;
    }
    if (phone.trim() && phone.replace(/\D/g, "").length < 8) {
      toast.error("Revisá el teléfono: parece que faltan números.");
      return;
    }
    if (selected === OTHER && !otherName.trim()) {
      toast.error("Escribí cuál es tu oficio, o elegí uno de la lista.");
      return;
    }
    setBusy(true);
    try {
      await createLocalProfile({ brand_name: name.trim(), phone: phone.trim(), primary_color: color }, logo);
      const oficioId = selected === OTHER ? (await addCustomOficio(otherName, "unidad")).id : selected;
      if (oficioId) await setOficios([oficioId]);
      router.replace("/presupuestos/editar");
    } catch {
      toast.error("No se pudo guardar. Probá de nuevo.");
      setBusy(false);
    }
  }

  async function restore(file: File | undefined) {
    setBusy(true);
    if (await restoreFromFile(file)) router.replace("/panel");
    else setBusy(false);
  }

  return (
    <main className="mx-auto max-w-lg px-5 pt-8 pb-36">
      <BrandThemePreview color={color} />
      <h1 className="text-3xl leading-tight font-extrabold tracking-tight">¡Bienvenido a PresupuestApp!</h1>
      <p className="mt-2 text-lg text-muted-foreground">Cargá tus datos una sola vez. Después hacés presupuestos en un minuto.</p>

      <div className="mt-8 space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-lg">
            Tu nombre o el de tu negocio
          </Label>
          <Input
            id="name"
            ref={nameInput}
            autoComplete="name"
            placeholder="Plomería Don Carlos"
            className="h-12"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-lg">
            Tu teléfono
          </Label>
          <Input id="phone" type="tel" autoComplete="tel" placeholder="11 2345-6789" className="h-12" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <p className="text-muted-foreground">Va en tus presupuestos para que te llamen.</p>
        </div>

        <section className="space-y-2">
          <Label htmlFor="search" className="text-lg">
            ¿Qué oficio tenés?
          </Label>
          <Input id="search" placeholder="Buscar: plomero, electricista…" className="h-12" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="max-h-64 overflow-y-auto rounded-xl border bg-card p-2" role="radiogroup" aria-label="Oficios">
            <div className="flex flex-wrap gap-2">
              {visible.map((oficio) => (
                <OficioChip key={oficio.id} active={selected === oficio.id} onClick={() => setSelected(oficio.id)}>
                  {oficio.name}
                </OficioChip>
              ))}
              <OficioChip active={selected === OTHER} onClick={() => setSelected(OTHER)}>
                Otro
              </OficioChip>
            </div>
          </div>
          {selected === OTHER && (
            <Input aria-label="Tu oficio" placeholder="Escribí tu oficio" className="h-12" value={otherName} onChange={(event) => setOtherName(event.target.value)} />
          )}
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div>
            <h2 className="text-lg font-bold">Tu marca (si querés)</h2>
            <p className="text-muted-foreground">Podés saltear esto y cambiarlo cuando quieras en Ajustes.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Tu logo</Label>
            <LogoPicker value={logo} onChange={setLogo} />
          </div>
          <div className="space-y-2">
            <Label>Color de tus presupuestos</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </section>

        <div className="text-center">
          <Button variant="link" className="h-auto text-base" onClick={() => restoreInput.current?.click()} disabled={busy}>
            <Upload /> Ya usaba la app: recuperar mi copia de seguridad
          </Button>
          <input
            ref={restoreInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="restore-input"
            onChange={(event) => {
              void restore(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-lg">
          <Button size="lg" className="h-14 w-full text-lg" onClick={start} disabled={busy}>
            Empezar
          </Button>
        </div>
      </div>
    </main>
  );
}

function OficioChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn("min-h-11 rounded-full border px-4 py-2 text-left font-medium", active ? "border-primary bg-primary text-primary-foreground" : "bg-background")}
    >
      {children}
    </button>
  );
}

/** Tiñe la pantalla con el color que se va eligiendo, antes de que exista el perfil. */
function BrandThemePreview({ color }: { color: string }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", color);
    root.style.setProperty("--primary-foreground", contrastColor(color));
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--primary-foreground");
    };
  }, [color]);
  return null;
}
