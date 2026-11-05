"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Camera, FileText, MessageCircle, Phone, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { budgetNumberLabel } from "@/lib/budget-document";
import { addJobPhoto, deleteJobPhoto, updateJob } from "@/lib/data";
import { db } from "@/lib/db";
import { formatMoney, toWhatsAppNumber } from "@/lib/format";
import { JOB_STATUSES, JOB_STATUS_LABEL, type JobPhoto } from "@/lib/types";
import { cn } from "@/lib/utils";

function PhotoGrid({ jobId }: { jobId: string }) {
  const photos = useLiveQuery(() => db.job_photos.where("job_id").equals(jobId).sortBy("created_at"), [jobId], [] as JobPhoto[]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<Record<string, string>>({});

  // Las fotos viven en IndexedDB: se muestran con una URL temporal.
  useEffect(() => {
    const missing = photos.filter((photo) => !sources[photo.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const photo of missing) {
        const file = await db.blobs.get(photo.id);
        if (!file) continue;
        objectUrls.current[photo.id] ??= URL.createObjectURL(file.blob);
        next[photo.id] = objectUrls.current[photo.id];
      }
      if (!cancelled && Object.keys(next).length > 0) setSources((current) => ({ ...current, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [photos, sources]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setAdding(true);
    try {
      for (const file of Array.from(files)) await addJobPhoto(jobId, file);
      toast.success(files.length === 1 ? "Foto agregada" : `${files.length} fotos agregadas`);
    } catch {
      toast.error("No se pudo guardar la foto.");
    } finally {
      setAdding(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">Fotos</h2>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
            {sources[photo.id] ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada o blob local
              <img src={sources[photo.id]} alt="Foto del trabajo" className="size-full object-cover" />
            ) : (
              <p className="flex size-full items-center justify-center p-2 text-center text-xs text-muted-foreground">No se encontró la foto</p>
            )}
            <button
              type="button"
              aria-label="Eliminar foto"
              onClick={() => void deleteJobPhoto(photo)}
              className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={adding}
          onClick={() => input.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-card text-sm text-muted-foreground"
        >
          <Camera className="size-6" />
          {adding ? "Guardando…" : "Agregar foto"}
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" data-testid="photo-input" onChange={(event) => add(event.target.files)} />
    </section>
  );
}

function JobDetail({ id }: { id: string }) {
  const job = useLiveQuery(() => db.jobs.get(id), [id]);
  const budget = useLiveQuery(async () => (job ? db.budgets.get(job.budget_id) : undefined), [job?.budget_id]);
  const client = useLiveQuery(async () => (budget ? db.clients.get(budget.client_id) : undefined), [budget?.client_id]);
  const [notes, setNotes] = useState<string | null>(null);

  if (!job) return null;

  const whatsapp = client && toWhatsAppNumber(client.phone);

  async function saveNotes() {
    if (notes !== null && notes !== job!.notes) {
      await updateJob(id, { notes });
      toast.success("Notas guardadas");
    }
  }

  return (
    <>
      <PageHeader
        title={client?.name ?? "Trabajo"}
        back={
          <Button asChild variant="ghost" size="icon" aria-label="Volver">
            <Link href="/trabajos">
              <ArrowLeft />
            </Link>
          </Button>
        }
      />
      <div className="space-y-6 px-4">
        {client && (
          <section className="flex items-center gap-1 rounded-xl border bg-card p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">{client.address || "Sin dirección"}</p>
              {budget && (
                <Link href={`/presupuestos/ver?id=${budget.id}`} className="money mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  <FileText className="size-4" /> {budgetNumberLabel(budget.number)} · {formatMoney(budget.total)}
                </Link>
              )}
            </div>
            {client.phone && (
              <Button asChild variant="ghost" size="icon" aria-label="Llamar">
                <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`}>
                  <Phone />
                </a>
              </Button>
            )}
            {whatsapp && (
              <Button asChild variant="ghost" size="icon" aria-label="Escribir por WhatsApp">
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle />
                </a>
              </Button>
            )}
          </section>
        )}

        <section>
          <h2 className="mb-2 text-lg font-bold">Estado</h2>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Estado del trabajo">
            {JOB_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                role="radio"
                aria-checked={job.status === status}
                onClick={() => void updateJob(id, { status })}
                className={cn(
                  "h-11 rounded-lg border font-semibold",
                  job.status === status ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                {JOB_STATUS_LABEL[status]}
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="start">Inicio</Label>
            <Input id="start" type="date" value={job.start_date ?? ""} onChange={(event) => void updateJob(id, { start_date: event.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end">Fin estimado</Label>
            <Input id="end" type="date" min={job.start_date ?? undefined} value={job.end_date ?? ""} onChange={(event) => void updateJob(id, { end_date: event.target.value || null })} />
          </div>
        </section>

        <section className="space-y-1.5">
          <Label htmlFor="job-notes" className="text-lg font-bold">Notas</Label>
          <Textarea
            id="job-notes"
            placeholder="Llave del portón, horario, materiales que faltan…"
            value={notes ?? job.notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={saveNotes}
          />
        </section>

        <PhotoGrid jobId={id} />
      </div>
    </>
  );
}

function Page() {
  const id = useSearchParams().get("id");
  return id ? <JobDetail key={id} id={id} /> : null;
}

export default function JobDetailPage() {
  return (
    <Suspense>
      <Page />
    </Suspense>
  );
}
