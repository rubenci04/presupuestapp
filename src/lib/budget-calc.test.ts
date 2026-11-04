import { describe, expect, it } from "vitest";
import { advanceAmount, computeTotals, lineTotal, round2, saleUnitPrice } from "./budget-calc";

describe("redondeo", () => {
  it("corrige el error binario", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("materiales", () => {
  it("aplica el markup sobre el costo", () => {
    expect(saleUnitPrice(1000, 30)).toBe(1300);
    expect(saleUnitPrice(333.33, 30)).toBe(433.33);
    expect(saleUnitPrice(1000, 0)).toBe(1000);
  });

  it("calcula el importe con cantidades decimales", () => {
    expect(lineTotal(2.5, 1300)).toBe(3250);
    expect(lineTotal(0.333, 100)).toBe(33.3);
  });
});

describe("computeTotals", () => {
  const items = [
    { type: "labor" as const, quantity: 2, unit_price: 50000 },
    { type: "material" as const, quantity: 3, unit_price: 1300, cost_price: 1000 },
  ];

  it("separa subtotales y agrega IVA 21%", () => {
    expect(computeTotals(items, 21)).toEqual({
      subtotal_labor: 100000,
      subtotal_materials: 3900,
      iva_amount: 21819,
      total: 125719,
      materials_margin: 900,
    });
  });

  it("soporta IVA 10,5% y 0%", () => {
    expect(computeTotals(items, 10.5).iva_amount).toBe(10909.5);
    expect(computeTotals(items, 10.5).total).toBe(114809.5);
    expect(computeTotals(items, 0).total).toBe(103900);
  });

  it("no acumula error de punto flotante entre líneas", () => {
    const many = Array.from({ length: 10 }, () => ({ type: "labor" as const, quantity: 1, unit_price: 0.1 }));
    expect(computeTotals(many, 0).total).toBe(1);
  });

  it("presupuesto vacío da cero", () => {
    expect(computeTotals([], 21).total).toBe(0);
  });
});

describe("anticipo", () => {
  it("es un porcentaje del total", () => {
    expect(advanceAmount(125719, 50)).toBe(62859.5);
  });
});
