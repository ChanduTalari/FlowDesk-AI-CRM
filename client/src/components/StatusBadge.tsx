import type { LeadStatus } from "../types/lead";

const statusMetadata: Record<LeadStatus, { label: string; className: string }> =
  {
    New: {
      label: "New",
      className:
        "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20",
    },
    Emailed: {
      label: "Emailed",
      className:
        "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    },
    Contacted: {
      label: "Contacted",
      className:
        "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
    },
    Closed: {
      label: "Closed",
      className:
        "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-zinc-800 dark:text-gray-300 dark:ring-zinc-600/30",
    },
  };

interface StatusBadgeProps {
  status: LeadStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const metadata = statusMetadata[status];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${metadata.className}`}
    >
      <span
        className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
      {metadata.label}
    </span>
  );
}
