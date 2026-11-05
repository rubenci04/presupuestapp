"use client";

import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { BackupSection } from "@/components/backup-section";
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
import { getLogoBlob, getProfessional, saveProfile, setLogo, setOficios } from "@/lib/data";
import { db } from "@/lib/db";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function InstallButton() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  if (!installEvent) return null;
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      onClick={async () => {
        await installEvent.prompt();
        setInstallEvent(null);
      }}
    >
      <Download /> Poner la app en el celular
    </Button>
  );
}

export default function AjustesPage() {
  const [personal, setPersonal] = useState<PersonalValues | null>(null);
  const [brand, setBrand] = useState<BrandValues | null>(null);
  const [initialLogo, setInitialLogo] = useState<Blob | null>(null);
  const [oficios, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const professional = await getProfessional();
      const logo = await getLogoBlob();
      setPersonal({
        name: professional.name,
        last_name: professional.last_name,
        phone: professional.phone,
        cuit: professional.cuit ?? "",
        address: professional.address,
        zone: professional.zone,
      });
      setBrand({
        brand_name: professional.brand_name,
        primary_color: professional.primary_color,
        footer_text: professional.footer_text,
        logo,
      });
      setInitialLogo(logo);
      const rows = await db.professional_oficios.toArray();
      setSelected(new Set(rows.map((row) => row.oficio_id)));
    })();
  }, []);

  if (!personal || !brand) return null;

  async function save() {
    const error = personalErrors(personal!) ?? brandErrors(brand!, personal!);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await saveProfile({
        ...personal!,
        cuit: personal!.cuit.trim() || null,
        brand_name: brand!.brand_name.trim(),
        primary_color: brand!.primary_color.toUpperCase(),
        footer_text: brand!.footer_text,
      });
      if (brand!.logo !== initialLogo) {
        await setLogo(brand!.logo);
        setInitialLogo(brand!.logo);
      }
      await setOficios([...oficios]);
      toast.success("Guardado");
    } catch {
      toast.error("No se pudo guardar. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Ajustes"
        back={
          <Button asChild variant="ghost" size="icon" aria-label="Volver al inicio">
            <Link href="/panel">
              <ArrowLeft />
            </Link>
          </Button>
        }
      />
      <div className="space-y-8 px-4">
        <BackupSection />

        <section>
          <h2 className="mb-3 text-lg font-bold">Tus datos</h2>
          <PersonalFields values={personal} onChange={setPersonal} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">Tu marca</h2>
          <BrandFields values={brand} onChange={setBrand} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-bold">Tus oficios</h2>
          <OficiosPicker selected={oficios} onChange={setSelected} />
        </section>

        <Button size="lg" className="w-full" onClick={save} disabled={saving}>
          Guardar cambios
        </Button>

        <InstallButton />
      </div>
    </>
  );
}
