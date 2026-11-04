import type { IvaPercent } from "./types";

/** Redondea a centavos corrigiendo el error binario (1.005 -> 1.01). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Precio de venta de un material: costo + markup, por unidad. */
export function saleUnitPrice(costPrice: number, markupPercent: number): number {
  return round2(costPrice * (1 + markupPercent / 100));
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

export interface BudgetTotals {
  subtotal_labor: number;
  subtotal_materials: number;
  iva_amount: number;
  total: number;
  /** Ganancia sobre materiales. Uso interno: nunca se muestra al cliente. */
  materials_margin: number;
}

interface TotalsItem {
  type: "labor" | "material";
  quantity: number;
  unit_price: number;
  cost_price?: number | null;
}

export function computeTotals(items: TotalsItem[], ivaPercent: IvaPercent): BudgetTotals {
  let subtotalLabor = 0;
  let subtotalMaterials = 0;
  let margin = 0;
  for (const item of items) {
    const total = lineTotal(item.quantity, item.unit_price);
    if (item.type === "labor") {
      subtotalLabor = round2(subtotalLabor + total);
    } else {
      subtotalMaterials = round2(subtotalMaterials + total);
      margin = round2(margin + total - lineTotal(item.quantity, item.cost_price ?? 0));
    }
  }
  const iva = round2(((subtotalLabor + subtotalMaterials) * ivaPercent) / 100);
  return {
    subtotal_labor: subtotalLabor,
    subtotal_materials: subtotalMaterials,
    iva_amount: iva,
    total: round2(subtotalLabor + subtotalMaterials + iva),
    materials_margin: margin,
  };
}

export function advanceAmount(total: number, advancePercent: number): number {
  return round2((total * advancePercent) / 100);
}

/** Solo las columnas que se persisten en el presupuesto (sin el margen interno). */
export function budgetTotals({ subtotal_labor, subtotal_materials, iva_amount, total }: BudgetTotals) {
  return { subtotal_labor, subtotal_materials, iva_amount, total };
}
