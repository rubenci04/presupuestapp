"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Copy, FileClock, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { BudgetStatusBadge, FilterChip } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { budgetNumberLabel } from "@/lib/budget-document";
import { duplicateBudget } from "@/lib/data";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { BUDGET_STATUS_LABEL, type BudgetStatus } from "@/lib/types";

const STATUSES = Object.keys(BUDGET_STATUS_LABEL) as BudgetStatus[];

export default function PresupuestosPage() {
  const router = useRouter();
  const budgets = useLiveQuery(() => db.budgets.toArray(), []);
  const clients = useLiveQuery(() => db.clients.toArray(), [], []);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BudgetStatus | "all">("all");

  const clientNames = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (budgets ?? [])
      .filter((budget) => status === "all" || budget.status === status)
      .filter((budget) => {
        if (!term) return true;
        const name = clientNames.get(budget.client_id)?.toLowerCase() ?? "";
        return name.includes(term) || String(budget.number ?? "").includes(term);
      })
      // Más nuevos arriba; los creados offline todavía no tienen número.
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [budgets, status, search, clientNames]);

  async function duplicate(id: string) {
    const copy = await duplicateBudget(id);
    toast.success("Presupuesto duplicado");
    router.push(`/presupuestos/editar?id=${copy.id}`);
  }

  return (
    <>
      <PageHeader
        title="Presupuestos"
        action={
          <>
            <Button asChild variant="ghost" size="icon" aria-label="Historial de PDFs">
              <Link href="/presupuestos/historial">
                <FileClock />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/presupuestos/editar">
                <Plus /> Nuevo
              </Link>
            </Button>
          </>
        }
      />

      {budgets?.length === 0 ? (
        <EmptyState
          title="Todavía no hiciste presupuestos"
          text="Armá el primero en un minuto y mandalo por WhatsApp."
          action={
            <Button asChild>
              <Link href="/presupuestos/editar">Crear presupuesto</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="relative mx-4">
            <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente o número"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 py-3">
            <FilterChip active={status === "all"} onClick={() => setStatus("all")}>
              Todos
            </FilterChip>
            {STATUSES.map((value) => (
              <FilterChip key={value} active={status === value} onClick={() => setStatus(value)}>
                {BUDGET_STATUS_LABEL[value]}
              </FilterChip>
            ))}
          </div>

          {filtered.length === 0 && budgets && <p className="px-4 py-8 text-center text-muted-foreground">Ningún presupuesto coincide con el filtro.</p>}

          <ul className="divide-y border-y bg-card">
            {filtered.map((budget) => (
              <li key={budget.id} className="flex items-center">
                <Link href={`/presupuestos/ver?id=${budget.id}`} className="min-w-0 flex-1 py-3 pl-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{clientNames.get(budget.client_id) ?? "Cliente"}</p>
                    <BudgetStatusBadge status={budget.status} />
                  </div>
                  <div className="money mt-0.5 flex justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      {budgetNumberLabel(budget.number)} · {formatDate(budget.date)}
                    </span>
                    <span className="font-semibold text-foreground">{formatMoney(budget.total)}</span>
                  </div>
                </Link>
                <Button variant="ghost" size="icon" aria-label="Duplicar" onClick={() => duplicate(budget.id)}>
                  <Copy className="text-muted-foreground" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
