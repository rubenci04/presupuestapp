"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ClientForm } from "@/components/client-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import type { Client } from "@/lib/types";

/** Selector de cliente con alta en el lugar, para no salir del presupuesto a medio cargar. */
export function ClientPicker({ value, onChange }: { value: string | null; onChange: (clientId: string) => void }) {
  const clients = useLiveQuery(() => db.clients.orderBy("name").toArray(), [], [] as Client[]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const selected = clients.find((client) => client.id === value);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? clients.filter((client) => client.name.toLowerCase().includes(term) || client.phone.includes(term)) : clients;
  }, [clients, search]);

  function openPicker() {
    setSearch("");
    setCreating(clients.length === 0);
    setOpen(true);
  }

  return (
    <>
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{selected.name}</p>
            <p className="truncate text-sm text-muted-foreground">{[selected.phone, selected.address].filter(Boolean).join(" · ")}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={openPicker}>
            Cambiar
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="lg" className="w-full border-dashed" onClick={openPicker}>
          <Plus /> Elegir o crear cliente
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{creating ? "Nuevo cliente" : "Elegí un cliente"}</DialogTitle>
          </DialogHeader>
          {creating ? (
            <ClientForm
              onSaved={(client) => {
                onChange(client.id);
                setOpen(false);
              }}
              onCancel={clients.length > 0 ? () => setCreating(false) : () => setOpen(false)}
            />
          ) : (
            <div className="space-y-3">
              <Button type="button" variant="secondary" className="w-full" onClick={() => setCreating(true)}>
                <Plus /> Crear cliente nuevo
              </Button>
              <div className="relative">
                <Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" />
                <Input placeholder="Buscar" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <ul className="divide-y">
                {filtered.map((client) => (
                  <li key={client.id}>
                    <button
                      type="button"
                      className="w-full py-2.5 text-left"
                      onClick={() => {
                        onChange(client.id);
                        setOpen(false);
                      }}
                    >
                      <p className="font-medium">{client.name}</p>
                      <p className="text-sm text-muted-foreground">{client.phone}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
