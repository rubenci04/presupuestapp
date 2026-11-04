import { BUDGET_STATUS_LABEL, JOB_STATUS_LABEL, type BudgetStatus, type JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const BUDGET_STYLE: Record<BudgetStatus, string> = {
  draft: "bg-stone-200 text-stone-800",
  sent: "bg-sky-100 text-sky-900",
  accepted: "bg-green-100 text-green-900",
  rejected: "bg-red-100 text-red-900",
};

const JOB_STYLE: Record<JobStatus, string> = {
  pending: "bg-stone-200 text-stone-800",
  in_progress: "bg-amber-100 text-amber-900",
  finished: "bg-sky-100 text-sky-900",
  paid: "bg-green-100 text-green-900",
};

const base = "inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function BudgetStatusBadge({ status }: { status: BudgetStatus }) {
  return <span className={cn(base, BUDGET_STYLE[status])}>{BUDGET_STATUS_LABEL[status]}</span>;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <span className={cn(base, JOB_STYLE[status])}>{JOB_STATUS_LABEL[status]}</span>;
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card",
      )}
    >
      {children}
    </button>
  );
}
