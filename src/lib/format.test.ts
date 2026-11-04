import { describe, expect, it } from "vitest";
import { addDaysISO, contrastColor, formatDate, formatMoney, parseDecimal, safeFileName, todayISO, toWhatsAppNumber } from "./format";

describe("formatMoney", () => {
  it("usa punto para miles y coma para decimales", () => {
    expect(formatMoney(1250000.5)).toBe("$ 1.250.000,50");
    expect(formatMoney(0)).toBe("$ 0,00");
    expect(formatMoney(-1500)).toBe("-$ 1.500,00");
  });
});

describe("parseDecimal", () => {
  it.each([
    ["1.250,50", 1250.5],
    ["1250,5", 1250.5],
    ["12.5", 12.5],
    ["1.250", 1250],
    ["1.250.000", 1250000],
    ["$ 2.000", 2000],
    ["0,5", 0.5],
    [",5", 0.5],
    ["30", 30],
  ])("%s -> %d", (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "1,2,3", "12a"])("rechaza %j", (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});

describe("fechas", () => {
  it("todayISO usa el calendario local, no UTC", () => {
    // 23:30 local: en UTC-3 toISOString ya daría el día siguiente.
    expect(todayISO(new Date(2026, 10, 4, 23, 30))).toBe("2026-11-04");
  });

  it("formatea sin correr el día", () => {
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
    expect(formatDate("2026-11-04T23:30:00.000Z")).toBe("04/11/2026");
    expect(formatDate(null)).toBe("");
  });

  it("suma días cruzando meses y años", () => {
    expect(addDaysISO("2026-12-20", 15)).toBe("2027-01-04");
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("toWhatsAppNumber", () => {
  it.each([
    ["11 2345-6789", "5491123456789"],
    ["011 15 2345-6789", "5491123456789"],
    ["1123456789", "5491123456789"],
    ["+54 9 11 2345-6789", "5491123456789"],
    ["+54 11 2345-6789", "5491123456789"],
    ["0351 15 234-5678", "5493512345678"],
    ["3515 15 23-4567", "5493515234567"],
    ["0054 9 351 234 5678", "5493512345678"],
  ])("%s -> %s", (input, expected) => {
    expect(toWhatsAppNumber(input)).toBe(expected);
  });

  it.each(["", "1234", "abc"])("rechaza %j", (input) => {
    expect(toWhatsAppNumber(input)).toBeNull();
  });
});

describe("contrastColor", () => {
  it("elige texto legible", () => {
    expect(contrastColor("#C2410C")).toBe("#FFFFFF");
    expect(contrastColor("#111827")).toBe("#FFFFFF");
    expect(contrastColor("#FDE047")).toBe("#1C1917");
  });
});

describe("safeFileName", () => {
  it("saca acentos y símbolos", () => {
    expect(safeFileName("José Peña / Obra")).toBe("Jose-Pena-Obra");
  });
});
