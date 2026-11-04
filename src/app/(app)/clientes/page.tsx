"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { FilePlus2, Phone, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader } from "@/components/app-shell";
import { ClientForm } from "@/components/client-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteClient } from "@/lib/data";
import { db } from "@/lib/db";
import type { Client } from "@/lib/types";

export default function ClientesPage() {
  const clients = useLiveQuery(() => db.clients.orderBy("name").toArray(), []);
  const budgets = useLiveQuery(() => db.budgets.toArray(), [], []);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Client | "new" | null>(null);

  const budgetCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const budget of budgets) counts.set(budget.client_id, (counts.get(budget.client_id) ?? 0) + 1);
    return counts;
  }, [budgets]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients ?? [];
    return (clients ?? []).filter((client) =>
      [client.name, client.phone, client.address].some((field) => field.toLowerCase().includes(term)),
    );
  }, [clients, search]);

  async function remove(client: Client) {
    if (await deleteClient(client.id)) {
      toast.success("Cliente eliminado");
      setEditing(null);
    } else {
      toast.error("Tiene presupuestos cargados, así que no se puede eliminar.");
    }
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Nuevo
          </Button>
        }
      />

      {clients && clients.length > 0 && (
        <div className="relative mx-4 mb-3">
          <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, teléfono o dirección"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      )}

      {clients?.length === 0 && (
        <EmptyState
          title="Todavía no tenés clientes"
          text="Se guardan solos cuando armás un presupuesto, o podés cargarlos acá."
          action={<Button onClick={() => setEditing("new")}>Cargar cliente</Button>}
        />
      )}
      {clients && clients.length > 0 && filtered.length === 0 && (
        <p className="px-4 py-8 text-center text-muted-foreground">No hay clientes que coincidan con “{search}”.</p>
      )}

      <ul className="divide-y border-y bg-card">
        {filtered.map((client) => (
          <li key={client.id} className="flex items-center gap-1 pr-2">
            <button type="button" className="min-w-0 flex-1 px-4 py-3 text-left" onClick={() => setEditing(client)}>
              <p className="truncate font-semibold">{client.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {[client.phone, client.address].filter(Boolean).join(" · ") || "Sin datos de contacto"}
              </p>
              <p className="text-xs text-muted-foreground">
                {budgetCount.get(client.id) ?? 0} presupuesto{budgetCount.get(client.id) === 1 ? "" : "s"}
              </p>
            </button>
            {client.phone && (
              <Button asChild variant="ghost" size="icon" aria-label={`Llamar a ${client.name}`}>
                <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`}>
                  <Phone />
                </a>
              </Button>
            )}
            <Button asChild variant="ghost" size="icon" aria-label={`Nuevo presupuesto para ${client.name}`}>
              <Link href={`/presupuestos/editar?cliente=${client.id}`}>
                <FilePlus2 />
              </Link>
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Nuevo cliente" : "Editar cliente"}</DialogTitle>
          </DialogHeader>
          {editing !== null && (
            <ClientForm
              key={editing === "new" ? "new" : editing.id}
              client={editing === "new" ? undefined : editing}
              onSaved={() => setEditing(null)}
            />
          )}
          {editing !== null && editing !== "new" && (
            <Button variant="ghost" className="w-full text-destructive" onClick={() => remove(editing)}>
              <Trash2 /> Eliminar cliente
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
