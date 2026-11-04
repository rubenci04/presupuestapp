"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Download, LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import {
  BrandFields,
  brandErrors,
  OficiosPicker,
  PersonalFields,
  personalErrors,
  type BrandValues,
  type PersonalValues,
} from "@/components/profile-fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pendingChangesCount, signOut, useAuth } from "@/lib/auth";
import { getProfessional, saveProfile, setOficios } from "@/lib/data";
import { db } from "@/lib/db";
import { retryFailed } from "@/lib/sync";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
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
      className="w-full"
      onClick={async () => {
        await installEvent.prompt();
        setInstallEvent(null);
      }}
    >
      <Download /> Instalar en el celular
    </Button>
  );
}

function FailedChanges() {
  const failed = useLiveQuery(() => db.outbox.filter((entry) => Boolean(entry.error)).toArray(), [], []);
  if (failed.length === 0) return null;
  return (
    <section className="mx-4 mb-4 rounded-xl border border-destructive/40 bg-card p-4">
      <h2 className="font-semibold text-destructive">Cambios sin guardar en el servidor</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {failed.length === 1 ? "Un cambio fue rechazado" : `${failed.length} cambios fueron rechazados`}. Siguen guardados en este celular.
      </p>
      <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
        {failed.slice(0, 5).map((entry) => (
          <li key={entry.key}>{entry.error}</li>
        ))}
      </ul>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => void retryFailed()}>
        <RefreshCw /> Reintentar
      </Button>
    </section>
  );
}

export default function PerfilPage() {
  const router = useRouter();
  const auth = useAuth();
  const [personal, setPersonal] = useState<PersonalValues | null>(null);
  const [brand, setBrand] = useState<BrandValues | null>(null);
  const [oficios, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pendingOnLogout, setPendingOnLogout] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const professional = await getProfessional();
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
        logo_url: professional.logo_url,
      });
      const rows = await db.professional_oficios.toArray();
      setSelected(new Set(rows.map((row) => row.oficio_id)));
    })();
  }, []);

  if (!personal || !brand) return null;

  async function save() {
    const error = personalErrors(personal!) ?? brandErrors(brand!);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      await saveProfile({
        ...personal!,
        cuit: personal!.cuit.trim() || null,
        ...brand!,
        primary_color: brand!.primary_color.toUpperCase(),
      });
      await setOficios([...oficios]);
      toast.success("Perfil guardado");
    } catch {
      toast.error("No se pudo guardar. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    const pending = await pendingChangesCount();
    if (pending > 0 && pendingOnLogout === null) {
      setPendingOnLogout(pending);
      return;
    }
    await signOut();
    router.replace("/login");
  }

  return (
    <>
      <PageHeader title="Perfil" />
      <FailedChanges />
      <div className="space-y-8 px-4">
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

        <section className="space-y-3 border-t pt-6">
          <InstallButton />
          {auth.status === "signed-in" && <p className="text-center text-sm text-muted-foreground">{auth.email}</p>}
          <Button variant="ghost" className="w-full text-destructive" onClick={logout}>
            <LogOut /> Cerrar sesión
          </Button>
        </section>
      </div>

      <AlertDialog open={pendingOnLogout !== null} onOpenChange={(open) => !open && setPendingOnLogout(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tenés cambios sin subir</AlertDialogTitle>
            <AlertDialogDescription>
              Hay {pendingOnLogout} cambios que todavía no llegaron al servidor. Si cerrás sesión ahora, se pierden. Conectate a internet y esperá unos segundos para no perderlos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={logout}>
              Cerrar igual
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
