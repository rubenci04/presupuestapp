import { advanceAmount } from "@/lib/budget-calc";
import { brandDisplayName, budgetNumberLabel, type BudgetDocumentData } from "@/lib/budget-document";
import { addDaysISO, contrastColor, formatDate, formatMoney, formatNumber } from "@/lib/format";
import type { BudgetItem } from "@/lib/types";

/**
 * Vista previa en HTML con la misma estructura que el PDF. No se usa el visor de PDF
 * porque Chrome para Android no muestra PDFs embebidos en un iframe.
 */
export function BudgetPreview({ data }: { data: BudgetDocumentData }) {
  const { professional, client, budget, labor, materials, logoDataUrl } = data;
  const color = professional.primary_color;
  const onColor = contrastColor(color);

  const terms = [
    budget.validity_days > 0 && ["Validez", `${budget.validity_days} días (hasta el ${formatDate(addDaysISO(budget.date, budget.validity_days))})`],
    budget.advance_percent > 0 && ["Anticipo", `${formatNumber(budget.advance_percent)}% (${formatMoney(advanceAmount(budget.total, budget.advance_percent))})`],
    budget.warranty_days > 0 && ["Garantía de mano de obra", `${budget.warranty_days} días`],
    budget.payment_method.trim() && ["Forma de pago", budget.payment_method],
    budget.notes.trim() && ["Notas", budget.notes],
  ].filter(Boolean) as [string, string][];

  return (
    <article className="rounded-sm bg-white p-4 text-base leading-snug text-[#1C1917] shadow-sm ring-1 ring-border">
      <header className="flex items-center gap-3 border-b-[3px] pb-3" style={{ borderColor: color }}>
        {logoDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- data URL local
          <img src={logoDataUrl} alt="" className="h-12 w-16 object-contain object-left" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold">{brandDisplayName(professional)}</p>
          <p className="text-xs text-[#6B635B]">{[professional.phone, professional.zone].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold" style={{ color }}>
            PRESUPUESTO
          </p>
          <p className="font-bold">{budgetNumberLabel(budget.number)}</p>
          <p className="text-xs text-[#6B635B]">{formatDate(budget.date)}</p>
        </div>
      </header>

      <section className="mt-3">
        <p className="text-sm font-bold text-[#6B635B]">CLIENTE</p>
        <p className="font-bold">{client.name}</p>
        <p className="text-xs text-[#6B635B]">{[client.phone, client.address, client.email].filter(Boolean).join(" · ")}</p>
      </section>

      {labor.length > 0 && <ItemsBlock title="Mano de obra" items={labor} color={color} onColor={onColor} subtotal={budget.subtotal_labor} />}
      {materials.length > 0 && <ItemsBlock title="Materiales" items={materials} color={color} onColor={onColor} subtotal={budget.subtotal_materials} />}

      <section className="money mt-4 ml-auto max-w-64 space-y-1">
        {labor.length > 0 && <Row label="Mano de obra" value={formatMoney(budget.subtotal_labor)} />}
        {materials.length > 0 && <Row label="Materiales" value={formatMoney(budget.subtotal_materials)} />}
        {budget.iva_percent > 0 && <Row label={`IVA ${formatNumber(budget.iva_percent)}%`} value={formatMoney(budget.iva_amount)} />}
        <div className="flex justify-between px-2 py-1.5 text-base font-bold" style={{ backgroundColor: color, color: onColor }}>
          <span>TOTAL</span>
          <span>{formatMoney(budget.total)}</span>
        </div>
      </section>

      {terms.length > 0 && (
        <section className="mt-4 bg-[#F7F4EF] p-3">
          <p className="mb-1 text-sm font-bold text-[#6B635B]">CONDICIONES</p>
          <dl className="space-y-1">
            {terms.map(([label, value]) => (
              <div key={label}>
                <dt className="inline text-[#6B635B]">{label}: </dt>
                <dd className="inline whitespace-pre-line">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {professional.footer_text.trim() && <p className="mt-3 text-xs whitespace-pre-line text-[#6B635B]">{professional.footer_text}</p>}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-2">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ItemsBlock({ title, items, color, onColor, subtotal }: { title: string; items: BudgetItem[]; color: string; onColor: string; subtotal: number }) {
  return (
    <section className="mt-4">
      <h3 className="px-2 py-1 text-xs font-bold" style={{ backgroundColor: color, color: onColor }}>
        {title}
      </h3>
      <ul className="divide-y divide-[#E3DCD2]">
        {items.map((item) => (
          <li key={item.id} className="money px-2 py-1.5">
            <p>{item.description}</p>
            <p className="flex justify-between text-xs text-[#6B635B]">
              <span>
                {formatNumber(item.quantity)} {item.unit} × {formatMoney(item.unit_price)}
              </span>
              <span className="font-semibold text-[#1C1917]">{formatMoney(item.total)}</span>
            </p>
          </li>
        ))}
      </ul>
      <p className="money px-2 pt-1 text-right font-bold">Subtotal: {formatMoney(subtotal)}</p>
    </section>
  );
}
