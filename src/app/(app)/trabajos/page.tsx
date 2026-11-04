"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { FilterChip, JobStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { JOB_STATUSES, JOB_STATUS_LABEL, type JobStatus } from "@/lib/types";

export default function TrabajosPage() {
  const jobs = useLiveQuery(() => db.jobs.toArray(), []);
  const budgets = useLiveQuery(() => db.budgets.toArray(), [], []);
  const clients = useLiveQuery(() => db.clients.toArray(), [], []);
  const [status, setStatus] = useState<JobStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => {
    const budgetById = new Map(budgets.map((budget) => [budget.id, budget]));
    const clientById = new Map(clients.map((client) => [client.id, client]));
    return (jobs ?? [])
      .filter((job) => status === "all" || job.status === status)
      .filter((job) => {
        if (!from && !to) return true;
        // Con filtro de fechas, los que no tienen fecha de inicio no entran.
        if (!job.start_date) return false;
        return (!from || job.start_date >= from) && (!to || job.start_date <= to);
      })
      .map((job) => {
        const budget = budgetById.get(job.budget_id);
        return { job, budget, client: budget && clientById.get(budget.client_id) };
      })
      // Sin fecha al principio: son los que faltan agendar.
      .sort((a, b) => (a.job.start_date ?? "").localeCompare(b.job.start_date ?? ""));
  }, [jobs, budgets, clients, status, from, to]);

  return (
    <>
      <PageHeader title="Trabajos" />

      {jobs?.length === 0 ? (
        <EmptyState
          title="Tu agenda está vacía"
          text="Cuando un cliente acepte un presupuesto, pasalo a trabajo y aparece acá."
          action={
            <Button asChild variant="outline">
              <Link href="/presupuestos">Ver presupuestos</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto px-4 pb-3">
            <FilterChip active={status === "all"} onClick={() => setStatus("all")}>
              Todos
            </FilterChip>
            {JOB_STATUSES.map((value) => (
              <FilterChip key={value} active={status === value} onClick={() => setStatus(value)}>
                {JOB_STATUS_LABEL[value]}
              </FilterChip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 px-4 pb-3">
            <div className="space-y-1">
              <Label htmlFor="from" className="text-xs text-muted-foreground">Inicio desde</Label>
              <Input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to" className="text-xs text-muted-foreground">Inicio hasta</Label>
              <Input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>

          {rows.length === 0 && jobs && <p className="px-4 py-8 text-center text-muted-foreground">Ningún trabajo coincide con el filtro.</p>}

          <ul className="divide-y border-y bg-card">
            {rows.map(({ job, budget, client }) => (
              <li key={job.id}>
                <Link href={`/trabajos/ver?id=${job.id}`} className="block px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{client?.name ?? "Cliente"}</p>
                    <JobStatusBadge status={job.status} />
                  </div>
                  {client?.address && <p className="truncate text-sm text-muted-foreground">{client.address}</p>}
                  <div className="money mt-0.5 flex justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      {job.start_date
                        ? `${formatDate(job.start_date)}${job.end_date ? ` al ${formatDate(job.end_date)}` : ""}`
                        : "Sin fecha"}
                    </span>
                    {budget && <span className="font-semibold text-foreground">{formatMoney(budget.total)}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
