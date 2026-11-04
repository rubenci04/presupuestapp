const decimal2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimalAny = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

/** $ 1.250.000,50 */
export function formatMoney(value: number): string {
  const body = decimal2.format(Math.abs(value));
  return value < 0 ? `-$ ${body}` : `$ ${body}`;
}

/** 1.250,5 — para cantidades y porcentajes. */
export function formatNumber(value: number): string {
  return decimalAny.format(value);
}

/**
 * Interpreta lo que tipea un usuario argentino. El teclado numérico de Android ofrece
 * punto o coma según el fabricante, así que se aceptan ambos:
 *   "1.250,50" -> 1250.5    "1250,5" -> 1250.5    "12.5" -> 12.5
 *   "1.250" -> 1250 (un punto seguido de exactamente 3 dígitos es separador de miles)
 * Devuelve null si no es un número.
 */
export function parseDecimal(input: string): number | null {
  const text = input.trim().replace(/\s|\$/g, "");
  if (text === "") return null;
  let normalized: string;
  if (text.includes(",")) {
    normalized = text.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, "");
  } else {
    normalized = text;
  }
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  return Number(normalized);
}

// Las fechas se manejan como 'YYYY-MM-DD' de calendario local. Pasarlas por toISOString
// correría el día a partir de las 21 h en Argentina (UTC-3).

export function todayISO(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return todayISO(new Date(year, month - 1, day + days));
}

/**
 * Normaliza un teléfono argentino al formato de wa.me (549 + característica + número).
 * Contempla 0 de larga distancia, el 15 de celular y números ya internacionales.
 * Devuelve null si no parece un número argentino completo.
 */
export function toWhatsAppNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits === "") return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("54")) {
    digits = digits.slice(2);
    if (digits.startsWith("9")) digits = digits.slice(1);
  }
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12) {
    // Característica de 2 a 4 dígitos seguida del 15.
    for (const areaLength of [2, 3, 4]) {
      if (digits.slice(areaLength, areaLength + 2) === "15") {
        digits = digits.slice(0, areaLength) + digits.slice(areaLength + 2);
        break;
      }
    }
  }
  return digits.length === 10 ? `549${digits}` : null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Acepta 20-12345678-3 o 20123456783. */
export function isValidCuit(cuit: string): boolean {
  return cuit.replace(/\D/g, "").length === 11;
}

export function isValidHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

/** Color de texto legible sobre un fondo dado (luminancia WCAG). */
export function contrastColor(hex: string): "#FFFFFF" | "#1C1917" {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // El punto de cruce donde blanco y casi-negro dan el mismo contraste.
  return luminance > 0.18 ? "#1C1917" : "#FFFFFF";
}

export function safeFileName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
