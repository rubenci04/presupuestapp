import { db } from "./db";
import { safeFileName } from "./format";
import type { Budget, BudgetItem, Client, Professional } from "./types";

/** Todo lo que necesitan la vista previa y el PDF. Sin costos ni markup: es lo que ve el cliente. */
export interface BudgetDocumentData {
  professional: Professional;
  logoDataUrl: string | null;
  client: Client;
  budget: Budget;
  labor: BudgetItem[];
  materials: BudgetItem[];
}

export function budgetNumberLabel(number: number | null): string {
  return number === null ? "Sin número" : `Nº ${number}`;
}

export function brandDisplayName(professional: Professional): string {
  return professional.brand_name.trim() || `${professional.name} ${professional.last_name}`.trim();
}

export function pdfFileName(budget: Budget, client: Client): string {
  const number = budget.number === null ? "borrador" : budget.number;
  return `Presupuesto-${number}-${safeFileName(client.name)}.pdf`;
}

export async function loadBudgetDocument(budgetId: string): Promise<BudgetDocumentData | null> {
  const budget = await db.budgets.get(budgetId);
  if (!budget) return null;
  const [professional, client, items, logo] = await Promise.all([
    db.professionals.toCollection().first(),
    db.clients.get(budget.client_id),
    db.budget_items.where("budget_id").equals(budgetId).sortBy("position"),
    db.kv.get("logo"),
  ]);
  if (!professional || !client) return null;
  const cachedLogo = logo?.value as { url: string; dataUrl: string } | undefined;
  return {
    professional,
    client,
    budget,
    logoDataUrl: cachedLogo?.url === professional.logo_url ? cachedLogo.dataUrl : null,
    labor: items.filter((item) => item.type === "labor"),
    materials: items.filter((item) => item.type === "material"),
  };
}
