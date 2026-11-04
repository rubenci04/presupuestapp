"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, ImagePlus, Loader2, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addCustomOficio, uploadLogo } from "@/lib/data";
import { db } from "@/lib/db";
import { contrastColor, isValidCuit, isValidHexColor } from "@/lib/format";
import type { Oficio, Professional } from "@/lib/types";
import { UNITS } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PersonalValues = Pick<Professional, "name" | "last_name" | "phone" | "address" | "zone"> & { cuit: string };
export type BrandValues = Pick<Professional, "brand_name" | "primary_color" | "footer_text" | "logo_url">;

export function personalErrors(values: PersonalValues): string | null {
  if (!values.name.trim()) return "Falta tu nombre.";
  if (!values.last_name.trim()) return "Falta tu apellido.";
  if (values.phone.replace(/\D/g, "").length < 8) return "Cargá un teléfono válido: va en tus presupuestos.";
  if (values.cuit.trim() && !isValidCuit(values.cuit)) return "El CUIT/CUIL tiene que tener 11 números.";
  return null;
}

export function brandErrors(values: BrandValues): string | null {
  if (!isValidHexColor(values.primary_color)) return "El color tiene que tener el formato #RRGGBB.";
  return null;
}

export function PersonalFields({ values, onChange }: { values: PersonalValues; onChange: (values: PersonalValues) => void }) {
  const set = (key: keyof PersonalValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [key]: event.target.value });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" autoComplete="given-name" value={values.name} onChange={set("name")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Apellido</Label>
          <Input id="last_name" autoComplete="family-name" value={values.last_name} onChange={set("last_name")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" type="tel" autoComplete="tel" placeholder="11 2345-6789" value={values.phone} onChange={set("phone")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cuit">CUIT/CUIL (opcional)</Label>
        <Input id="cuit" inputMode="numeric" placeholder="20-12345678-3" value={values.cuit} onChange={set("cuit")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="address">Dirección</Label>
        <Input id="address" autoComplete="street-address" value={values.address} onChange={set("address")} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="zone">Zona de trabajo</Label>
        <Input id="zone" placeholder="Zona Oeste, CABA…" value={values.zone} onChange={set("zone")} />
      </div>
    </div>
  );
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const COLOR_PRESETS = ["#C2410C", "#B91C1C", "#0F766E", "#15803D", "#1D4ED8", "#6D28D9", "#334155", "#111827"];

export function BrandFields({ values, onChange }: { values: BrandValues; onChange: (values: BrandValues) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("El logo tiene que ser PNG o JPG.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("El logo no puede pesar más de 2 MB.");
      return;
    }
    setUploading(true);
    try {
      onChange({ ...values, logo_url: await uploadLogo(file) });
      toast.success("Logo subido");
    } catch {
      toast.error("No se pudo subir el logo. Revisá tu conexión.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label>Logo</Label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-card text-muted-foreground"
            aria-label="Elegir logo"
          >
            {uploading ? (
              <Loader2 className="animate-spin" />
            ) : values.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- export estático, sin optimizador de imágenes
              <img src={values.logo_url} alt="Tu logo" className="size-full object-contain" />
            ) : (
              <ImagePlus />
            )}
          </button>
          <div className="min-w-0 text-sm text-muted-foreground">
            <p>PNG o JPG, hasta 2 MB.</p>
            <div className="mt-1 flex gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {values.logo_url ? "Cambiar" : "Subir logo"}
              </Button>
              {values.logo_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...values, logo_url: null })}>
                  Quitar
                </Button>
              )}
            </div>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          data-testid="logo-input"
          onChange={(event) => pickLogo(event.target.files?.[0])}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="brand_name">Nombre de fantasía o marca</Label>
        <Input
          id="brand_name"
          placeholder="Plomería Don Carlos"
          value={values.brand_name}
          onChange={(event) => onChange({ ...values, brand_name: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">Si lo dejás vacío, usamos tu nombre y apellido.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="primary_color">Color principal</Label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              onClick={() => onChange({ ...values, primary_color: color })}
              className="flex size-10 items-center justify-center rounded-full"
              style={{ backgroundColor: color, color: contrastColor(color) }}
            >
              {values.primary_color.toUpperCase() === color && <Check className="size-5" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Elegir otro color"
            value={isValidHexColor(values.primary_color) ? values.primary_color : "#C2410C"}
            onChange={(event) => onChange({ ...values, primary_color: event.target.value.toUpperCase() })}
            className="size-11 shrink-0 rounded-lg border bg-card p-1"
          />
          <Input
            id="primary_color"
            value={values.primary_color}
            onChange={(event) => onChange({ ...values, primary_color: event.target.value })}
            className="font-mono uppercase"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="footer_text">Texto al pie del presupuesto</Label>
        <Textarea
          id="footer_text"
          placeholder="Garantía, validez, condiciones de pago…"
          value={values.footer_text}
          onChange={(event) => onChange({ ...values, footer_text: event.target.value })}
        />
      </div>
    </div>
  );
}

const CATEGORY_ORDER = ["Construcción y obra", "Instalaciones", "Herrería y metal", "Carpintería y madera", "Otros oficios frecuentes"];

export function OficiosPicker({ selected, onChange }: { selected: Set<string>; onChange: (selected: Set<string>) => void }) {
  const oficios = useLiveQuery(() => db.oficios.toArray(), [], [] as Oficio[]);
  const [search, setSearch] = useState("");
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState<string>("unidad");

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, Oficio[]>();
    for (const oficio of oficios) {
      if (term && !oficio.name.toLowerCase().includes(term)) continue;
      map.set(oficio.category, [...(map.get(oficio.category) ?? []), oficio]);
    }
    const rank = (category: string) => {
      const index = CATEGORY_ORDER.indexOf(category);
      return index === -1 ? CATEGORY_ORDER.length : index;
    };
    return [...map.entries()]
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([category, items]) => [category, items.sort((a, b) => a.name.localeCompare(b.name, "es"))] as const);
  }, [oficios, search]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  async function addCustom() {
    const name = customName.trim();
    if (!name) return;
    if (oficios.some((oficio) => oficio.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Ese oficio ya está en la lista.");
      return;
    }
    const oficio = await addCustomOficio(name, customUnit);
    onChange(new Set(selected).add(oficio.id));
    setCustomName("");
    toast.success("Oficio agregado");
  }

  return (
    <div className="space-y-5">
      <Input placeholder="Buscar oficio…" value={search} onChange={(event) => setSearch(event.target.value)} />

      {groups.map(([category, items]) => (
        <section key={category}>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{category}</h3>
          <div className="flex flex-wrap gap-2">
            {items.map((oficio) => {
              const active = selected.has(oficio.id);
              return (
                <button
                  key={oficio.id}
                  type="button"
                  title={oficio.description}
                  aria-pressed={active}
                  onClick={() => toggle(oficio.id)}
                  className={cn(
                    "min-h-10 rounded-full border px-3.5 py-1.5 text-left text-sm font-medium transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                  )}
                >
                  {oficio.name}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <section className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">¿No está el tuyo? Agregalo</h3>
        <div className="mt-2 space-y-2">
          <Input placeholder="Nombre del oficio" value={customName} onChange={(event) => setCustomName(event.target.value)} />
          <div className="flex gap-2">
            <select
              aria-label="Unidad típica"
              value={customUnit}
              onChange={(event) => setCustomUnit(event.target.value)}
              className="h-11 flex-1 rounded-lg border border-input bg-card px-3 text-base"
            >
              {UNITS.map((unit) => (
                <option key={unit}>{unit}</option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={addCustom} disabled={!customName.trim()}>
              <Plus /> Agregar
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
