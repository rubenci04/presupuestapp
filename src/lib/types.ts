// Filas tal como viven en Supabase y en IndexedDB.

export interface Professional {
  id: string;
  user_id: string;
  name: string;
  last_name: string;
  phone: string;
  cuit: string | null;
  address: string;
  zone: string;
  logo_url: string | null;
  brand_name: string;
  primary_color: string;
  footer_text: string;
  onboarded_at: string | null;
  created_at: string;
}

export interface Oficio {
  id: string;
  name: string;
  description: string;
  unit: string;
  category: string;
  professional_id: string | null;
}

export interface ProfessionalOficio {
  professional_id: string;
  oficio_id: string;
}

export interface Client {
  id: string;
  professional_id: string;
  name: string;
  phone: string;
  address: string;
  email: string | null;
  created_at: string;
}

export type BudgetStatus = "draft" | "sent" | "accepted" | "rejected";

export const BUDGET_STATUS_LABEL: Record<BudgetStatus, string> = {
  draft: "Borrador",
  sent: "Enviado",
  accepted: "Aceptado",
  rejected: "Rechazado",
};

export type IvaPercent = 0 | 10.5 | 21;

export interface Budget {
  id: string;
  professional_id: string;
  client_id: string;
  /** Lo asigna el servidor; null hasta la primera sincronización. */
  number: number | null;
  date: string;
  status: BudgetStatus;
  validity_days: number;
  advance_percent: number;
  warranty_days: number;
  payment_method: string;
  notes: string;
  subtotal_labor: number;
  subtotal_materials: number;
  iva_percent: IvaPercent;
  iva_amount: number;
  total: number;
  pdf_url: string | null;
  created_at: string;
}

export type BudgetItemType = "labor" | "material";

export interface BudgetItem {
  id: string;
  budget_id: string;
  type: BudgetItemType;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  cost_price: number | null;
  markup_percent: number | null;
  total: number;
  position: number;
}

export type JobStatus = "pending" | "in_progress" | "finished" | "paid";

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  finished: "Terminado",
  paid: "Cobrado",
};

export const JOB_STATUSES: JobStatus[] = ["pending", "in_progress", "finished", "paid"];

export interface Job {
  id: string;
  budget_id: string;
  professional_id: string;
  status: JobStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  created_at: string;
}

export interface JobPhoto {
  id: string;
  job_id: string;
  url: string;
  created_at: string;
}

export interface BudgetPdf {
  id: string;
  budget_id: string;
  professional_id: string;
  url: string;
  file_name: string;
  total: number;
  created_at: string;
}

export const UNITS = ["unidad", "m²", "ml", "m³", "hora", "jornada", "global", "kg", "litro"] as const;
