"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { signedPdfLink } from "@/lib/data";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import type { BudgetPdf } from "@/lib/types";

export default function HistorialPage() {
  const pdfs = useLiveQuery(() => db.budget_pdfs.orderBy("created_at").reverse().toArray(), []);
  const [opening, setOpening] = useState<string | null>(null);

  async function open(pdf: BudgetPdf) {
    setOpening(pdf.id);
    try {
      // Si todavía no se subió, el archivo sigue en el celular.
      const pending = await db.blobs.get(pdf.id);
      const url = pending ? URL.createObjectURL(pending.blob) : await signedPdfLink(pdf.url);
      if (!url) {
        toast.error("Necesitás conexión para abrir este PDF.");
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      if (pending) anchor.download = pdf.file_name;
      anchor.click();
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <PageHeader
        title="PDFs generados"
        back={
          <Button asChild variant="ghost" size="icon" aria-label="Volver">
            <Link href="/presupuestos">
              <ArrowLeft />
            </Link>
          </Button>
        }
      />
      {pdfs?.length === 0 && <EmptyState title="Todavía no generaste PDFs" text="Acá vas a ver cada PDF que generes, con su fecha." />}
      <ul className="divide-y border-y bg-card">
        {pdfs?.map((pdf) => (
          <li key={pdf.id} className="flex items-center gap-2 py-2 pr-2 pl-4">
            <Link href={`/presupuestos/ver?id=${pdf.budget_id}`} className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{pdf.file_name}</p>
              <p className="money text-sm text-muted-foreground">
                {formatDate(pdf.created_at)} · {formatMoney(pdf.total)}
              </p>
            </Link>
            <Button variant="ghost" size="icon" aria-label={`Abrir ${pdf.file_name}`} onClick={() => open(pdf)} disabled={opening === pdf.id}>
              {opening === pdf.id ? <Loader2 className="animate-spin" /> : <Download />}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
