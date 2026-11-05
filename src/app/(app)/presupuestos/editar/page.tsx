"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Eye, FileDown, Hammer, Package, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { BudgetPreview } from "@/components/budget-preview";
import { ClientPicker } from "@/components/client-picker";
import { DecimalInput } from "@/components/decimal-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { budgetTotals, computeTotals, lineTotal, saleUnitPrice } from "@/lib/budget-calc";
import { loadLogoDataUrl, type BudgetDocumentData } from "@/lib/budget-document";
import { buildItems, getProfessional, newId, saveBudget, type ItemInput } from "@/lib/data";
import { db } from "@/lib/db";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { UNITS, type Budget, type BudgetItemType, type IvaPercent, type Oficio } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Line {
  id: string;
  type: BudgetItemType;
  description: string;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  cost_price: number | null;
  markup_percent: number | null;
}

interface FormState {
  clientId: string | null;
  date: string;
  lines: Line[];
  ivaPercent: IvaPercent;
  validityDays: number | null;
  advancePercent: number | null;
  warrantyDays: number | null;
  paymentMethod: string;
  notes: string;
}

const DEFAULT_MARKUP = 30;
const PAYMENT_OPTIONS = ["Efectivo", "Transferencia", "Mercado Pago", "Efectivo o transferencia"];
const DRAFT_KEY = "presupuesto-borrador";

const emptyForm = (): FormState => ({
  clientId: null,
  date: todayISO(),
  lines: [],
  ivaPercent: 21,
  validityDays: 15,
  advancePercent: 0,
  warrantyDays: 30,
  paymentMethod: "",
  notes: "",
});

function newLine(type: BudgetItemType, description = "", unit = "unidad"): Line {
  return {
    id: newId(),
    type,
    description,
    quantity: 1,
    unit,
    unit_price: null,
    cost_price: null,
    markup_percent: type === "material" ? DEFAULT_MARKUP : null,
  };
}

/** Precio de venta unitario de una línea, tolerando campos todavía vacíos. */
function linePrice(line: Line): number {
  return line.type === "material"
    ? saleUnitPrice(line.cost_price ?? 0, line.markup_percent ?? 0)
    : (line.unit_price ?? 0);
}

// Android puede matar la pestaña al cambiar de app (por ejemplo, para ver un precio en
// otra), así que un presupuesto nuevo a medio cargar se guarda como borrador local.
function readDraft(): FormState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as FormState) : null;
  } catch {
    return null;
  }
}

function writeDraft(form: FormState | null) {
  try {
    if (form) localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Sin almacenamiento disponible simplemente no hay borrador.
  }
}

function validate(form: FormState): string | null {
  if (!form.clientId) return "Elegí un cliente.";
  if (form.lines.length === 0) return "Agregá al menos un ítem.";
  for (const line of form.lines) {
    const label = line.type === "labor" ? "mano de obra" : "materiales";
    if (!line.description.trim()) return `Falta la descripción de un ítem de ${label}.`;
    if (!line.quantity || line.quantity <= 0) return `Revisá la cantidad de “${line.description}”.`;
    if (line.type === "labor" && (line.unit_price === null || line.unit_price < 0)) return `Falta el precio de “${line.description}”.`;
    if (line.type === "material" && (line.cost_price === null || line.cost_price < 0)) return `Falta el costo de “${line.description}”.`;
    if (line.type === "material" && (line.markup_percent === null || line.markup_percent < 0)) return `Revisá la ganancia de “${line.description}”.`;
  }
  return null;
}

function toItemInputs(lines: Line[]): ItemInput[] {
  return lines.map((line) => ({
    id: line.id,
    type: line.type,
    description: line.description.trim(),
    quantity: line.quantity ?? 0,
    unit: line.unit,
    unit_price: line.unit_price ?? 0,
    cost_price: line.type === "material" ? line.cost_price : null,
    markup_percent: line.type === "material" ? line.markup_percent : null,
  }));
}

function LineCard({ line, onChange, onRemove }: { line: Line; onChange: (line: Line) => void; onRemove: () => void }) {
  const isMaterial = line.type === "material";
  return (
    <li className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex gap-2">
        <Input
          aria-label="Descripción"
          placeholder={isMaterial ? "Ej: Caño termofusión 1/2" : "Ej: Instalación de termotanque"}
          value={line.description}
          onChange={(event) => onChange({ ...line, description: event.target.value })}
        />
        <Button type="button" variant="ghost" size="icon" aria-label="Quitar ítem" onClick={onRemove}>
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Cantidad</Label>
          <DecimalInput value={line.quantity} onValueChange={(quantity) => onChange({ ...line, quantity })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Unidad</Label>
          <select
            aria-label="Unidad"
            value={line.unit}
            onChange={(event) => onChange({ ...line, unit: event.target.value })}
            className="h-11 w-full rounded-lg border border-input bg-card px-2 text-base"
          >
            {(UNITS as readonly string[]).includes(line.unit) ? null : <option>{line.unit}</option>}
            {UNITS.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </div>
        {isMaterial ? (
          <>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Lo que te cuesta (cada uno)</Label>
              <DecimalInput aria-label="Lo que te cuesta" placeholder="$" value={line.cost_price} onValueChange={(cost_price) => onChange({ ...line, cost_price })} />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Tu ganancia %</Label>
              <DecimalInput aria-label="Tu ganancia" value={line.markup_percent} onValueChange={(markup_percent) => onChange({ ...line, markup_percent })} />
            </div>
          </>
        ) : (
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-muted-foreground">Precio unitario</Label>
            <DecimalInput aria-label="Precio unitario" placeholder="$" value={line.unit_price} onValueChange={(unit_price) => onChange({ ...line, unit_price })} />
          </div>
        )}
      </div>
      <p className="money flex justify-between pt-1 text-sm">
        <span className="text-muted-foreground">{isMaterial ? `Al cliente: ${formatMoney(linePrice(line))} c/u` : "Importe"}</span>
        <span className="font-semibold">{formatMoney(lineTotal(line.quantity ?? 0, linePrice(line)))}</span>
      </p>
    </li>
  );
}

function SectionTitle({ icon: Icon, title, amount }: { icon: typeof Hammer; title: string; amount?: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="size-4 text-primary" />
      <h2 className="flex-1 text-lg font-bold">{title}</h2>
      {amount !== undefined && <span className="money font-semibold">{formatMoney(amount)}</span>}
    </div>
  );
}

function BudgetEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const budgetId = params.get("id");
  const presetClient = params.get("cliente");

  const [form, setForm] = useState<FormState>(emptyForm);
  const [existing, setExisting] = useState<Budget | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<BudgetDocumentData | null>(null);
  const skipDraftRef = useRef(false);

  const myOficios = useLiveQuery(
    async () => {
      const links = await db.professional_oficios.toArray();
      const oficios = await db.oficios.bulkGet(links.map((link) => link.oficio_id));
      return oficios.filter(Boolean) as Oficio[];
    },
    [],
    [] as Oficio[],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (budgetId) {
        const budget = await db.budgets.get(budgetId);
        if (!budget) {
          toast.error("No se encontró el presupuesto.");
          router.replace("/presupuestos");
          return;
        }
        const items = await db.budget_items.where("budget_id").equals(budgetId).sortBy("position");
        if (cancelled) return;
        setExisting(budget);
        setForm({
          clientId: budget.client_id,
          date: budget.date,
          ivaPercent: budget.iva_percent,
          validityDays: budget.validity_days,
          advancePercent: budget.advance_percent,
          warrantyDays: budget.warranty_days,
          paymentMethod: budget.payment_method,
          notes: budget.notes,
          lines: items.map(({ id, type, description, quantity, unit, unit_price, cost_price, markup_percent }) => ({
            id, type, description, quantity, unit, unit_price, cost_price, markup_percent,
          })),
        });
      } else {
        const draft = readDraft();
        if (cancelled) return;
        if (draft && draft.lines.length > 0) {
          setForm({ ...draft, clientId: presetClient ?? draft.clientId });
          toast("Recuperamos el presupuesto que estabas cargando", {
            action: {
              label: "Descartar",
              onClick: () => {
                setForm({ ...emptyForm(), clientId: presetClient });
                writeDraft(null);
              },
            },
          });
        } else if (presetClient) {
          setForm((current) => ({ ...current, clientId: presetClient }));
        }
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [budgetId, presetClient, router]);

  useEffect(() => {
    if (loaded && !budgetId && !skipDraftRef.current) writeDraft(form);
  }, [form, loaded, budgetId]);

  const totals = useMemo(
    () =>
      computeTotals(
        form.lines.map((line) => ({
          type: line.type,
          quantity: line.quantity ?? 0,
          unit_price: linePrice(line),
          cost_price: line.cost_price,
        })),
        form.ivaPercent,
      ),
    [form.lines, form.ivaPercent],
  );

  const labor = form.lines.filter((line) => line.type === "labor");
  const materials = form.lines.filter((line) => line.type === "material");

  const patch = (changes: Partial<FormState>) => setForm((current) => ({ ...current, ...changes }));
  const updateLine = (line: Line) =>
    setForm((current) => ({ ...current, lines: current.lines.map((other) => (other.id === line.id ? line : other)) }));
  const removeLine = (id: string) =>
    setForm((current) => ({ ...current, lines: current.lines.filter((line) => line.id !== id) }));
  const addLine = (line: Line) => setForm((current) => ({ ...current, lines: [...current.lines, line] }));

  const budgetInput = () => ({
    client_id: form.clientId!,
    date: form.date,
    iva_percent: form.ivaPercent,
    validity_days: Math.round(form.validityDays ?? 0),
    advance_percent: form.advancePercent ?? 0,
    warranty_days: Math.round(form.warrantyDays ?? 0),
    payment_method: form.paymentMethod.trim(),
    notes: form.notes.trim(),
  });

  async function openPreview() {
    const error = validate(form);
    if (error) {
      toast.error(error);
      return;
    }
    const [professional, client, logoDataUrl] = await Promise.all([
      getProfessional(),
      db.clients.get(form.clientId!),
      loadLogoDataUrl(),
    ]);
    if (!client) return;
    const items = buildItems(existing?.id ?? "preview", toItemInputs(form.lines));
    const computed = budgetTotals(totals);
    setPreview({
      professional,
      client,
      logoDataUrl,
      labor: items.filter((item) => item.type === "labor"),
      materials: items.filter((item) => item.type === "material"),
      budget: {
        id: existing?.id ?? "preview",
        professional_id: professional.id,
        number: existing?.number ?? null,
        status: existing?.status ?? "draft",
        pdf_url: null,
        created_at: "",
        ...budgetInput(),
        ...computed,
      },
    });
  }

  async function saveAndGenerate() {
    const error = validate(form);
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      const budget = await saveBudget(budgetInput(), toItemInputs(form.lines), budgetId ?? undefined);
      skipDraftRef.current = true;
      writeDraft(null);
      router.replace(`/presupuestos/ver?id=${budget.id}&generar=1`);
    } catch {
      setSaving(false);
      toast.error("No se pudo guardar el presupuesto.");
    }
  }

  if (!loaded) return null;

  return (
    <div className="pb-24">
      <PageHeader
        title={existing ? "Editar presupuesto" : "Nuevo presupuesto"}
        back={
          <Button asChild variant="ghost" size="icon" aria-label="Volver">
            <Link href={existing ? `/presupuestos/ver?id=${existing.id}` : "/presupuestos"}>
              <ArrowLeft />
            </Link>
          </Button>
        }
      />

      <div className="space-y-7 px-4 pt-1">
        <section>
          <h2 className="mb-2 text-lg font-bold">Cliente</h2>
          <ClientPicker value={form.clientId} onChange={(clientId) => patch({ clientId })} />
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="date">Fecha</Label>
            <Input id="date" type="date" value={form.date} onChange={(event) => patch({ date: event.target.value })} />
          </div>
        </section>

        <section>
          <SectionTitle icon={Hammer} title="Mano de obra" amount={labor.length ? totals.subtotal_labor : undefined} />
          {myOficios.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Agregar desde tus oficios">
              {myOficios.map((oficio) => (
                <button
                  key={oficio.id}
                  type="button"
                  className="h-9 shrink-0 rounded-full border bg-card px-3 text-sm whitespace-nowrap"
                  onClick={() => addLine(newLine("labor", oficio.name, oficio.unit))}
                >
                  + {oficio.name}
                </button>
              ))}
            </div>
          )}
          <ul className="space-y-2">
            {labor.map((line) => (
              <LineCard key={line.id} line={line} onChange={updateLine} onRemove={() => removeLine(line.id)} />
            ))}
          </ul>
          <Button type="button" variant="outline" className="mt-2 w-full border-dashed" onClick={() => addLine(newLine("labor"))}>
            <Plus /> Agregar mano de obra
          </Button>
        </section>

        <section>
          <SectionTitle icon={Package} title="Materiales" amount={materials.length ? totals.subtotal_materials : undefined} />
          <ul className="space-y-2">
            {materials.map((line) => (
              <LineCard key={line.id} line={line} onChange={updateLine} onRemove={() => removeLine(line.id)} />
            ))}
          </ul>
          <Button type="button" variant="outline" className="mt-2 w-full border-dashed" onClick={() => addLine(newLine("material"))}>
            <Plus /> Agregar material
          </Button>
          {totals.materials_margin > 0 && (
            <p className="money mt-2 text-sm text-muted-foreground">
              Tu ganancia en materiales: <strong className="text-foreground">{formatMoney(totals.materials_margin)}</strong>. El cliente no la ve.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">IVA</h2>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Porcentaje de IVA">
            {([21, 10.5, 0] as IvaPercent[]).map((percent) => (
              <button
                key={percent}
                type="button"
                role="radio"
                aria-checked={form.ivaPercent === percent}
                onClick={() => patch({ ivaPercent: percent })}
                className={cn(
                  "h-11 rounded-lg border font-semibold",
                  form.ivaPercent === percent ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                {String(percent).replace(".", ",")}%
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">Condiciones</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="validity" className="text-xs">Validez (días)</Label>
              <DecimalInput id="validity" value={form.validityDays} onValueChange={(validityDays) => patch({ validityDays })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="advance" className="text-xs">Anticipo %</Label>
              <DecimalInput id="advance" value={form.advancePercent} onValueChange={(advancePercent) => patch({ advancePercent })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="warranty" className="text-xs">Garantía (días)</Label>
              <DecimalInput id="warranty" value={form.warrantyDays} onValueChange={(warrantyDays) => patch({ warrantyDays })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment">Forma de pago</Label>
            <Input id="payment" list="payment-options" value={form.paymentMethod} onChange={(event) => patch({ paymentMethod: event.target.value })} />
            <datalist id="payment-options">
              {PAYMENT_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} />
          </div>
        </section>

        <section className="money space-y-1 rounded-xl border bg-card p-4 text-sm">
          <div className="flex justify-between"><span>Mano de obra</span><span>{formatMoney(totals.subtotal_labor)}</span></div>
          <div className="flex justify-between"><span>Materiales</span><span>{formatMoney(totals.subtotal_materials)}</span></div>
          <div className="flex justify-between"><span>IVA {String(form.ivaPercent).replace(".", ",")}%</span><span>{formatMoney(totals.iva_amount)}</span></div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl">
          <p className="money mb-2 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-extrabold" data-testid="budget-total">{formatMoney(totals.total)}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={openPreview}>
              <Eye /> Vista previa
            </Button>
            <Button type="button" onClick={saveAndGenerate} disabled={saving}>
              <FileDown /> Armar PDF
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto bg-background p-3">
          <DialogHeader>
            <DialogTitle>Vista previa · {preview && formatDate(preview.budget.date)}</DialogTitle>
          </DialogHeader>
          {preview && <BudgetPreview data={preview} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <BudgetEditor />
    </Suspense>
  );
}
