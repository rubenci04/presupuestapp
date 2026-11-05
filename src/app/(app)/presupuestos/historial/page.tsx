"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { downloadBlob } from "@/components/backup-section";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import type { BudgetPdf } from "@/lib/types";

export default function HistorialPage() {
  const pdfs = useLiveQuery(() => db.budget_pdfs.orderBy("created_at").reverse().toArray(), []);

  async function download(pdf: BudgetPdf) {
    const file = await db.blobs.get(pdf.id);
    if (!file) {
      toast.error("No encontramos este PDF. Armalo de nuevo desde el presupuesto.");
      return;
    }
    downloadBlob(file.blob, pdf.file_name);
  }

  return (
    <>
      <PageHeader
        title="PDFs armados"
        back={
          <Button asChild variant="ghost" size="icon" aria-label="Volver">
            <Link href="/presupuestos">
              <ArrowLeft />
            </Link>
          </Button>
        }
      />
      {pdfs?.length === 0 && <EmptyState title="Todavía no armaste ningún PDF" text="Acá vas a ver cada PDF que armes, con su fecha." />}
      <ul className="divide-y border-y bg-card">
        {pdfs?.map((pdf) => (
          <li key={pdf.id} className="flex items-center gap-2 py-2 pr-2 pl-4">
            <Link href={`/presupuestos/ver?id=${pdf.budget_id}`} className="min-w-0 flex-1">
              <p className="truncate font-semibold">{pdf.file_name}</p>
              <p className="money text-muted-foreground">
                {formatDate(pdf.created_at)} · {formatMoney(pdf.total)}
              </p>
            </Link>
            <Button variant="ghost" size="icon" aria-label={`Descargar ${pdf.file_name}`} onClick={() => void download(pdf)}>
              <Download />
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
