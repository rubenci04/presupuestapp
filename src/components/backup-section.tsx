"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { DatabaseBackup, Download, Send, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
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
import { BackupError, createBackup, restoreBackup } from "@/lib/backup";
import { BACKUP_REMINDER_DISMISSED_KEY, LAST_BACKUP_KEY } from "@/lib/config";
import { db, getKv, setKv } from "@/lib/db";
import { formatDate } from "@/lib/format";

const DAY = 24 * 60 * 60 * 1000;
const REMIND_AFTER_DAYS = 7;

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Descarga la copia de seguridad. Devuelve true si se pudo. */
export async function saveBackupFile(): Promise<boolean> {
  try {
    const { blob, fileName } = await createBackup();
    downloadBlob(blob, fileName);
    toast.success("Copia guardada en tu celular. Guardala también en otro lado, como Drive o WhatsApp.");
    return true;
  } catch {
    toast.error("No se pudo hacer la copia. Probá de nuevo.");
    return false;
  }
}

/** Pide la copia recuperada al usuario y la aplica. Devuelve true si se restauró. */
export async function restoreFromFile(file: File | undefined): Promise<boolean> {
  if (!file) return false;
  try {
    await restoreBackup(file);
    toast.success("Listo, recuperamos tus datos.");
    return true;
  } catch (error) {
    toast.error(error instanceof BackupError ? error.message : "No se pudo leer el archivo.");
    return false;
  }
}

/** Aviso suave en el inicio, sin tapar nada. Aparece si pasó más de una semana sin copia. */
export function BackupReminder() {
  const state = useLiveQuery(async () => {
    const [last, dismissed, professional, budgets] = await Promise.all([
      getKv<string>(LAST_BACKUP_KEY),
      getKv<string>(BACKUP_REMINDER_DISMISSED_KEY),
      db.professionals.toCollection().first(),
      db.budgets.count(),
    ]);
    return { last, dismissed, since: professional?.created_at, budgets };
  }, []);

  if (!state || state.budgets === 0) return null;
  const now = Date.now();
  const reference = state.last ?? state.since;
  if (!reference || now - new Date(reference).getTime() < REMIND_AFTER_DAYS * DAY) return null;
  if (state.dismissed && now - new Date(state.dismissed).getTime() < REMIND_AFTER_DAYS * DAY) return null;

  return (
    <section className="rounded-xl border border-primary/40 bg-card p-4">
      <p className="font-semibold">Hacé una copia de seguridad</p>
      <p className="mt-1 text-muted-foreground">
        {state.last ? "Hace más de una semana que no guardás una copia." : "Todavía no guardaste ninguna copia."} Si
        se rompe o se pierde el celular, tus presupuestos se pierden.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/perfil#copia">Hacer la copia</Link>
        </Button>
        <Button variant="ghost" onClick={() => void setKv(BACKUP_REMINDER_DISMISSED_KEY, new Date().toISOString())}>
          Más tarde
        </Button>
      </div>
    </section>
  );
}

export function BackupSection() {
  const lastBackup = useLiveQuery(() => getKv<string>(LAST_BACKUP_KEY), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  async function send() {
    try {
      const { blob, fileName } = await createBackup();
      const file = new File([blob], fileName, { type: "application/json" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        downloadBlob(blob, fileName);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast.error("No se pudo enviar la copia.");
    }
  }

  return (
    <section id="copia" className="scroll-mt-4 space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <DatabaseBackup className="size-5 text-primary" /> Copia de seguridad
      </h2>
      <p className="text-muted-foreground">
        Tus datos están guardados solo en este celular. Si lo perdés, se rompe o desinstalás la app, se borran. Guardá una
        copia cada tanto: incluye presupuestos, clientes, trabajos, fotos y tu logo.
      </p>
      <p className="font-medium">{lastBackup ? `Última copia: ${formatDate(lastBackup)}` : "Todavía no hiciste ninguna copia."}</p>
      <div className="grid gap-2">
        <Button size="lg" onClick={() => void saveBackupFile()}>
          <Download /> Guardar copia
        </Button>
        {canShareFiles && (
          <Button size="lg" variant="outline" onClick={() => void send()}>
            <Send /> Enviar copia (WhatsApp, Drive, mail)
          </Button>
        )}
        <Button size="lg" variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload /> Recuperar una copia
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid="restore-input"
        onChange={(event) => {
          setPendingFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />

      <AlertDialog open={pendingFile !== null} onOpenChange={(open) => !open && setPendingFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Recuperar esta copia?</AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplaza todo lo que tenés ahora en este celular por lo que hay en la copia. Si querés conservar lo de ahora, primero guardá una copia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restoreFromFile(pendingFile ?? undefined)}>Sí, recuperar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
