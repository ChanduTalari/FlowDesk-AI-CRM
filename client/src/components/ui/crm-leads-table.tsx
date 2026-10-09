import { useMemo, useState } from "react";
import { ArrowUpDown, Eye, Search, SlidersHorizontal } from "lucide-react";
import type { Lead, LeadStatus } from "@/types/lead";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

interface CrmLeadsTableProps {
  leads: Lead[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onViewLead: (lead: Lead) => void;
}

type SortKey = "name" | "status" | "likelyScore" | "createdAt";

const STATUS_STYLE: Record<LeadStatus, string> = {
  New: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/20",
  Emailed:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  Contacted:
    "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
  Closed:
    "bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-zinc-800 dark:text-gray-300 dark:ring-zinc-600/30",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function scoreStyle(score: number | null, priority?: Lead["priority"]): string {
  if (score === null)
    return "bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400";
  if (priority === "High" || score >= 75)
    return "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300";
  if (priority === "Medium" || score >= 50)
    return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300";
  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
}

/**
 * Lead records with status badges and row actions.
 * Table on desktop, scroll-contained on small screens.
 */
export function CrmLeadsTable({
  leads,
  loading,
  refreshing,
  onRefresh,
  onViewLead,
}: CrmLeadsTableProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "All">("All");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = leads.filter((lead) => {
      const okStatus = status === "All" || lead.status === status;
      const okQuery =
        !needle ||
        [lead.name, lead.email, lead.source ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return okStatus && okQuery;
    });
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "likelyScore")
        cmp = (a.likelyScore ?? -1) - (b.likelyScore ?? -1);
      else cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [leads, query, status, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  return (
    <section
      aria-label="Lead records"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:p-5 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
            Lead records
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {visible.length} of {leads.length} in current view
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, source"
              aria-label="Search leads"
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus-visible:outline-none dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-indigo-500 dark:focus:bg-zinc-950"
            />
          </label>
          <div className="flex gap-2">
            <label className="relative inline-flex items-center">
              <SlidersHorizontal className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LeadStatus | "All")}
                aria-label="Filter by status"
                className="h-10 appearance-none rounded-xl border border-gray-200 bg-white pl-9 pr-8 text-sm font-medium text-gray-700 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-800 dark:bg-black dark:text-gray-200"
              >
                <option value="All">All stages</option>
                <option value="New">New</option>
                <option value="Emailed">Emailed</option>
                <option value="Contacted">Contacted</option>
                <option value="Closed">Closed</option>
              </select>
            </label>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-10 shrink-0 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-600 transition-all hover:border-indigo-200 hover:text-indigo-700 disabled:opacity-60 dark:border-zinc-800 dark:text-gray-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
            >
              {refreshing ? "Syncing" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80 text-xs dark:border-zinc-800 dark:bg-black/60">
              {(
                [
                  { key: "name", label: "Contact" },
                  { key: "status", label: "Stage" },
                  { key: "likelyScore", label: "AI score" },
                  { key: "createdAt", label: "Added" },
                ] as Array<{ key: SortKey; label: string }>
              ).map((col) => (
                <th key={col.key} className="px-4 py-3 font-semibold text-gray-500 first:pl-5 dark:text-gray-400">
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-900 dark:hover:text-white"
                  >
                    {col.label}
                    <ArrowUpDown
                      className={cn(
                        "h-3 w-3",
                        sortKey === col.key ? "text-indigo-500" : "text-gray-300 dark:text-gray-600",
                      )}
                    />
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold text-gray-500 last:pr-5 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
            {loading && leads.length === 0 ? (
              [0, 1, 2, 3].map((row) => (
                <tr key={row}>
                  <td colSpan={5} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-1/4 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                        <div className="h-3 w-1/3 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    No leads match these filters
                  </p>
                  <p className="mx-auto mt-1 max-w-[15rem] text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Clear the search or pick another stage to see more records.
                  </p>
                </td>
              </tr>
            ) : (
              visible.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onViewLead(lead)}
                  className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3 first:pl-5">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-200"
                      >
                        {initials(lead.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[11rem] truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {lead.name}
                        </span>
                        <span className="block max-w-[11rem] truncate text-xs text-gray-500 dark:text-gray-400">
                          {lead.email}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                        STATUS_STYLE[lead.status],
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                      {lead.status}
                    </span>
                    {lead.needsFollowUp && (
                      <span className="mt-1 block text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        Follow-up due
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {lead.likelyScore === null ? (
                      <span className="text-xs text-gray-400 dark:text-gray-400">Pending</span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
                          scoreStyle(lead.likelyScore, lead.priority),
                        )}
                      >
                        {lead.likelyScore} / 100
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {formatRelative(lead.createdAt)}
                    <span className="block max-w-[7rem] truncate text-[11px] text-gray-400 dark:text-gray-400">
                      {lead.source ?? "No source"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right last:pr-5">
                    <button
                      type="button"
                      aria-label={`View ${lead.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewLead(lead);
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
