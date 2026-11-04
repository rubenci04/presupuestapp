"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { BudgetStatusBadge, JobStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { budgetNumberLabel } from "@/lib/budget-document";
import { round2 } from "@/lib/budget-calc";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

function Stat({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="min-w-0 rounded-xl border bg-card p-3">
      <p className="money truncate text-xl font-extrabold">{value}</p>
      <p className="text-xs leading-tight text-muted-foreground">{label}</p>
    </Link>
  );
}

export default function PanelPage() {
  const professional = useLiveQuery(() => db.professionals.toCollection().first(), []);
  const budgets = useLiveQuery(() => db.budgets.toArray(), [], []);
  const jobs = useLiveQuery(() => db.jobs.toArray(), [], []);
  const clients = useLiveQuery(() => db.clients.toArray(), [], []);

  const { awaiting, active, toCollect, upcoming, recent } = useMemo(() => {
    const budgetById = new Map(budgets.map((budget) => [budget.id, budget]));
    const clientName = new Map(clients.map((client) => [client.id, client.name]));
    const nameOfBudget = (budgetId: string) => {
      const budget = budgetById.get(budgetId);
      return budget ? (clientName.get(budget.client_id) ?? "Cliente") : "Cliente";
    };
    return {
      awaiting: budgets.filter((budget) => budget.status === "sent").length,
      active: jobs.filter((job) => job.status === "in_progress").length,
      // Terminado y sin cobrar: la plata que hay que ir a buscar.
      toCollect: jobs
        .filter((job) => job.status === "finished")
        .reduce((sum, job) => round2(sum + (budgetById.get(job.budget_id)?.total ?? 0)), 0),
      upcoming: jobs
        .filter((job) => job.status === "pending" || job.status === "in_progress")
        .sort((a, b) => (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999"))
        .slice(0, 4)
        .map((job) => ({ job, name: nameOfBudget(job.budget_id) })),
      recent: [...budgets]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 4)
        .map((budget) => ({ budget, name: clientName.get(budget.client_id) ?? "Cliente" })),
    };
  }, [budgets, jobs, clients]);

  return (
    <div className="space-y-6 px-4 pt-6">
      <header>
        <p className="text-sm text-muted-foreground">Hola, {professional?.name || "de nuevo"}</p>
        <h1 className="truncate text-2xl font-extrabold tracking-tight">{professional?.brand_name || "Tu panel"}</h1>
      </header>

      <Button asChild size="lg" className="h-14 w-full text-lg">
        <Link href="/presupuestos/editar">
          <Plus className="size-6" /> Nuevo presupuesto
        </Link>
      </Button>

      <section className="grid grid-cols-3 gap-2">
        <Stat label="Sin respuesta" value={String(awaiting)} href="/presupuestos" />
        <Stat label="Trabajos en curso" value={String(active)} href="/trabajos" />
        <Stat label="Por cobrar" value={formatMoney(toCollect).replace(/,00$/, "")} href="/trabajos" />
      </section>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Próximos trabajos</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {upcoming.map(({ job, name }) => (
              <li key={job.id}>
                <Link href={`/trabajos/ver?id=${job.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{name}</p>
                    <p className="text-sm text-muted-foreground">{job.start_date ? formatDate(job.start_date) : "Sin fecha"}</p>
                  </div>
                  <JobStatusBadge status={job.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Últimos presupuestos</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {recent.map(({ budget, name }) => (
              <li key={budget.id}>
                <Link href={`/presupuestos/ver?id=${budget.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{name}</p>
                    <p className="money text-sm text-muted-foreground">
                      {budgetNumberLabel(budget.number)} · {formatMoney(budget.total)}
                    </p>
                  </div>
                  <BudgetStatusBadge status={budget.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
