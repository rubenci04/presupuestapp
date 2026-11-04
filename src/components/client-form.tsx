"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveClient } from "@/lib/data";
import { isValidEmail } from "@/lib/format";
import type { Client } from "@/lib/types";

export function ClientForm({
  client,
  onSaved,
  onCancel,
}: {
  client?: Client;
  onSaved: (client: Client) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(client?.name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Sin esto, un submit de este form también dispararía el del presupuesto que lo contiene.
    event.stopPropagation();
    if (!name.trim()) {
      toast.error("Falta el nombre del cliente.");
      return;
    }
    if (email.trim() && !isValidEmail(email)) {
      toast.error("El email no es válido.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveClient(
        { name: name.trim(), phone: phone.trim(), address: address.trim(), email: email.trim() || null },
        client?.id,
      );
      toast.success(client ? "Cliente actualizado" : "Cliente creado");
      onSaved(saved);
    } catch {
      toast.error("No se pudo guardar el cliente.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="client-name">Nombre</Label>
        <Input id="client-name" autoCapitalize="words" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="client-phone">Teléfono</Label>
        <Input id="client-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="client-address">Dirección</Label>
        <Input id="client-address" value={address} onChange={(event) => setAddress(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="client-email">Email (opcional)</Label>
        <Input id="client-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="flex gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={saving}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
