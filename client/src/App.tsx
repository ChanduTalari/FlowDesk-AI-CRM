import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Bot, Clock, Filter, Inbox, Sparkles, TrendingUp, X } from "lucide-react";
import { AuthGate } from "./components/AuthGate";
import { LeadDetails } from "./components/LeadDetails";
import { NewLeadDialog } from "./components/NewLeadDialog";
import { useAuth } from "./context/AuthContext";
import { useLeads } from "./context/LeadContext";
import {
  DashboardLayout,
  type CrmNavId,
  type CrmNotification,
} from "./components/ui/dashboard-layout";
import { CrmMetrics } from "./components/ui/crm-metrics";
import { CrmActivityFeed } from "./components/ui/crm-activity-feed";
import { CrmLeadsTable } from "./components/ui/crm-leads-table";
import { LeadSearchDialog } from "./components/ui/lead-search-dialog";
import { formatRelative } from "./lib/format";
import { cn } from "./lib/cn";
import type { Lead, LeadPriority } from "./types/lead";

const VIEW_META: Record<CrmNavId, { title: string; subtitle: string }> = {
  overview: {
    title: "Overview",
    subtitle: "Pipeline health, AI triage, and live activity",
  },
  leads: { title: "Leads", subtitle: "Search, filter, and open every record" },
  pipeline: {
    title: "Pipeline",
    subtitle: "Leads grouped by sales stage",
  },
  automations: {
    title: "AI Automations",
    subtitle: "Scoring coverage and follow-up workers",
  },
  contacts: {
    title: "Contact Records",
    subtitle: "People and companies in this workspace",
  },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const STAGES = ["New", "Emailed", "Contacted", "Closed"] as const;

const DISMISSED_KEY = "flowdesk.notifications.dismissed";
// Cap the stored list so a long-lived tab cannot grow it without bound.
const MAX_DISMISSED = 500;

function readDismissedNotifications(): ReadonlySet<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string"))
      : new Set();
  } catch {
    // Corrupt or blocked storage must never break the dashboard.
    return new Set();
  }
}

function writeDismissedNotifications(ids: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  try {
    // Keep the newest entries when trimming.
    const trimmed = [...ids].slice(-MAX_DISMISSED);
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(trimmed));
  } catch {
    // Private mode or a full quota: dismissal still holds for this session.
  }
}

function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const {
    leads,
    meta,
    priority,
    needsFollowUp,
    loading,
    refreshing,
    error,
    refresh,
    setPriority,
    setNeedsFollowUp,
    resetFilters,
    filtersActive,
  } = useLeads();
  const [view, setView] = useState<CrmNavId>("overview");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Notification ids the user has already cleared. Persisted so a dismiss or a
  // "clear all" survives a page reload, not just the 5s poll.
  const [dismissedNotifications, setDismissedNotifications] = useState<
    ReadonlySet<string>
  >(() => readDismissedNotifications());

  const addDismissed = useCallback((ids: string[]) => {
    setDismissedNotifications((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      if (next.size === current.size) return current;
      writeDismissedNotifications(next);
      return next;
    });
  }, []);

  const dismissNotification = useCallback(
    (id: string) => addDismissed([id]),
    [addDismissed],
  );

  const clearNotifications = useCallback(
    (ids: string[]) => addDismissed(ids),
    [addDismissed],
  );

  // Navigating anywhere from the shell clears any queue filter, so the Leads
  // tab always shows the full list unless a filter was just applied on purpose.
  const goTo = useCallback(
    (next: CrmNavId) => {
      resetFilters();
      setView(next);
    },
    [resetFilters],
  );

  // Queue CTAs apply exactly one filter at a time so the Leads table never
  // shows an intersection the user did not ask for.
  const openHighQueue = useCallback(() => {
    setNeedsFollowUp(false);
    setPriority("High");
    setView("leads");
  }, [setNeedsFollowUp, setPriority]);

  const openOverdueQueue = useCallback(() => {
    setPriority("All");
    setNeedsFollowUp(true);
    setView("leads");
  }, [setNeedsFollowUp, setPriority]);

  // Cmd/Ctrl + K opens lead search from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const notifications = useMemo<CrmNotification[]>(() => {
    const items: CrmNotification[] = [];
    const overdue = leads.filter((l) => l.needsFollowUp).slice(0, 3);
    for (const lead of overdue) {
      items.push({
        id: `overdue-${lead.id}`,
        title: "Follow-up overdue",
        body: `${lead.name} has waited over 3 days`,
        time: lead.createdAt,
        kind: "followup",
      });
    }
    const fresh = [...leads]
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 2);
    for (const lead of fresh) {
      items.push({
        id: `new-${lead.id}`,
        title: "New lead assigned",
        body: `${lead.name} from ${lead.source ?? "unknown source"}`,
        time: lead.createdAt,
        kind: "lead",
      });
    }
    const scored = leads
      .filter((l) => l.likelyScore !== null && l.likelyScoreGeneratedAt)
      .sort(
        (a, b) =>
          new Date(b.likelyScoreGeneratedAt as string).getTime() -
          new Date(a.likelyScoreGeneratedAt as string).getTime(),
      )
      .slice(0, 2);
    for (const lead of scored) {
      items.push({
        id: `scored-${lead.id}`,
        title: "AI scored a lead",
        body: `${lead.name} scored ${lead.likelyScore}/100`,
        time: lead.likelyScoreGeneratedAt,
        kind: "ai",
      });
    }
    return items.filter((item) => !dismissedNotifications.has(item.id)).slice(0, 7);
  }, [dismissedNotifications, leads]);

  // Sidebar badges count records that need attention, never the size of a view.
  // Each one names what it measures so the number is never read as a record count.
  const badgeCounts = useMemo(
    () => ({
      leads: {
        count: meta.overdueFollowUpCount,
        note: `${meta.overdueFollowUpCount} ${meta.overdueFollowUpCount === 1 ? "lead has" : "leads have"} an overdue follow-up`,
        tone: "warn" as const,
      },
      pipeline: {
        count: meta.highPriorityCount,
        note: `${meta.highPriorityCount} scored 75 or higher`,
        tone: "info" as const,
      },
      automations: {
        count: meta.unscoredCount,
        note: `${meta.unscoredCount} still awaiting an AI score`,
        tone: "info" as const,
      },
      contacts: {
        count: meta.suppressedCount,
        note: `${meta.suppressedCount} suppressed from email`,
        tone: "danger" as const,
      },
    }),
    [meta],
  );

  const openLead = (lead: Lead) => setSelectedLeadId(lead.id);

  if (authLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-black dark:text-gray-400">
        Loading session
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  const activeMeta = VIEW_META[view];

  return (
    <DashboardLayout
      active={view}
      onNavigate={goTo}
      title={activeMeta.title}
      subtitle={activeMeta.subtitle}
      userEmail={user.email ?? "teammate@flowdesk.ai"}
      syncing={refreshing}
      notifications={notifications}
      onRefresh={() => void refresh()}
      onDismissNotification={dismissNotification}
      onClearNotifications={clearNotifications}
      onNewLead={() => setNewLeadOpen(true)}
      onSignOut={() => void signOut()}
      totalLeads={meta.totalLeads}
      onOpenSearch={() => setSearchOpen(true)}
      badgeCounts={badgeCounts}
    >
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <CrmMetrics leads={leads} meta={meta} loading={loading} />

      <div className="mt-4">
        {view === "overview" && (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-4">
              <CrmLeadsTable
                leads={[...leads]
                  .filter((l) => l.likelyScore !== null)
                  .sort((a, b) => (b.likelyScore ?? 0) - (a.likelyScore ?? 0))
                  .slice(0, 8)}
                loading={loading}
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                onViewLead={openLead}
              />
              <AiTriageCard
                onHigh={openHighQueue}
                onOverdue={openOverdueQueue}
              />
            </div>
            <div className="min-w-0">
              <CrmActivityFeed leads={leads} loading={loading} onOpenLead={openLead} />
            </div>
          </div>
        )}

        {view === "leads" && (
          <div className="min-w-0 space-y-3">
            {filtersActive && (
              <ActiveFilterBanner
                priority={priority}
                needsFollowUp={needsFollowUp}
                onClear={resetFilters}
              />
            )}
            <CrmLeadsTable
              leads={leads}
              loading={loading}
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              onViewLead={openLead}
            />
          </div>
        )}

        {view === "pipeline" && <PipelineView leads={leads} onOpen={openLead} />}

        {view === "automations" && (
          <AutomationsView
            onHigh={openHighQueue}
            onOverdue={openOverdueQueue}
            onOpen={openLead}
          />
        )}

        {view === "contacts" && (
          <ContactsView leads={leads} loading={loading} onOpen={openLead} />
        )}
      </div>

      {selectedLeadId && (
        <LeadDetails leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      )}

      <LeadSearchDialog
        open={searchOpen}
        leads={leads}
        onClose={() => setSearchOpen(false)}
        onSelect={openLead}
      />

      {newLeadOpen && (
        <NewLeadDialog onClose={() => setNewLeadOpen(false)} open />
      )}
    </DashboardLayout>
  );
}

function ActiveFilterBanner({
  priority,
  needsFollowUp,
  onClear,
}: {
  priority: LeadPriority | "All";
  needsFollowUp: boolean;
  onClear: () => void;
}) {
  const parts: string[] = [];
  if (priority !== "All") {
    parts.push(`${priority.toLowerCase()} priority leads`);
  }
  if (needsFollowUp) {
    parts.push("overdue follow-ups");
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-500/25 dark:bg-indigo-500/10"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
        <Filter className="h-3.5 w-3.5" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-indigo-900 dark:text-indigo-100">
        <span className="font-semibold">Queue filter active.</span>{" "}
        Showing {parts.join(" and ")}. These numbers are a subset, not your
        total leads.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-[13px] font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98]"
      >
        <X className="h-3.5 w-3.5" />
        Show all leads
      </button>
    </div>
  );
}

function AiTriageCard({ onHigh, onOverdue }: { onHigh: () => void; onOverdue: () => void }) {
  const { meta } = useLeads();
  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/60 dark:border-indigo-500/20 dark:bg-indigo-500/5">
      <header className="flex items-center gap-2 border-b border-indigo-100 px-5 py-3.5 dark:border-indigo-500/20">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
          AI triage
        </h2>
        <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          Ready
        </span>
      </header>
      <div className="space-y-3 px-5 py-4">
        {meta.highPriorityCount > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm leading-6 text-gray-700 dark:text-gray-200">
              {meta.highPriorityCount} leads scored 75 to 100 and need a first
              touch this week.
            </p>
            <button
              type="button"
              onClick={onHigh}
              className="h-9 w-fit rounded-xl bg-indigo-600 px-3.5 text-[13px] font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98]"
            >
              Open high priority
            </button>
          </div>
        )}
        {meta.overdueFollowUpCount > 0 && (
          <div className="flex flex-col gap-2 border-t border-indigo-100 pt-3 dark:border-indigo-500/20">
            <p className="text-sm leading-6 text-gray-700 dark:text-gray-200">
              {meta.overdueFollowUpCount} follow-ups are overdue. Sequences pause
              when a lead replies.
            </p>
            <button
              type="button"
              onClick={onOverdue}
              className="h-9 w-fit rounded-xl border border-indigo-200 bg-white px-3.5 text-[13px] font-semibold text-indigo-700 transition-all hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/30 dark:bg-transparent dark:text-indigo-300"
            >
              Review overdue
            </button>
          </div>
        )}
        {meta.highPriorityCount === 0 && meta.overdueFollowUpCount === 0 && (
          <p className="text-sm leading-6 text-gray-700 dark:text-gray-200">
            Queue is clear. Every scored lead has a next action.
          </p>
        )}
      </div>
      <p className="border-t border-indigo-100 px-5 py-3 text-[11px] text-gray-500 dark:border-indigo-500/20 dark:text-gray-400">
        Scored on every sync.
      </p>
    </section>
  );
}

function PipelineView({ leads, onOpen }: { leads: Lead[]; onOpen: (l: Lead) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {STAGES.map((stage) => {
        const column = leads.filter((l) => l.status === stage);
        return (
          <section
            key={stage}
            className="flex min-h-[16rem] flex-col rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-zinc-800">
              <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
                {stage}
              </h3>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
                {column.length}
              </span>
            </header>
            <div className="flex-1 space-y-2 p-3">
              {column.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400 dark:border-zinc-800 dark:text-gray-400">
                  No leads in this stage
                </p>
              ) : (
                column.slice(0, 6).map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => onOpen(lead)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-black dark:hover:border-indigo-500/30 dark:hover:bg-gray-900"
                  >
                    <span className="block truncate text-[13px] font-semibold text-gray-900 dark:text-white">
                      {lead.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                      {lead.email}
                    </span>
                    <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-gray-600 ring-1 ring-inset ring-gray-200 dark:bg-zinc-950 dark:text-gray-300 dark:ring-zinc-700">
                      {lead.likelyScore === null ? "Pending" : `${lead.likelyScore}/100`}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AutomationsView({
  onHigh,
  onOverdue,
  onOpen,
}: {
  onHigh: () => void;
  onOverdue: () => void;
  onOpen: (l: Lead) => void;
}) {
  const { meta, leads, loading } = useLeads();
  const top = [...leads]
    .filter((l) => l.likelyScore !== null)
    .sort((a, b) => (b.likelyScore ?? 0) - (a.likelyScore ?? 0))
    .slice(0, 5);
  const rows = [
    {
      icon: TrendingUp,
      label: "Scored leads",
      value: `${leads.filter((l) => l.likelyScore !== null).length} of ${leads.length}`,
      hint: `Average score ${meta.averageScore}`,
      tint: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
      action: onHigh,
      cta: "View hot leads",
    },
    {
      icon: Clock,
      label: "Overdue follow-ups",
      value: String(meta.overdueFollowUpCount),
      hint: "Worker flags after 3 quiet days",
      tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
      action: onOverdue,
      cta: "Review queue",
    },
    {
      icon: Inbox,
      label: "Awaiting AI score",
      value: String(meta.unscoredCount),
      hint: "Background queue picks these up",
      tint: "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-gray-300",
    },
    {
      icon: Bot,
      label: "Suppressed contacts",
      value: String(meta.suppressedCount),
      hint: "No email until consent returns",
      tint: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    },
  ];
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <article
              key={row.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", row.tint)}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-400">
                {row.label}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 tabular-nums dark:text-white">
                {loading && leads.length === 0 ? "-" : row.value}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.hint}</p>
              {row.action && row.cta && (
                <button
                  type="button"
                  onClick={row.action}
                  className="mt-3 h-9 rounded-xl bg-gray-900 px-3.5 text-[13px] font-semibold text-white transition-all hover:bg-gray-700 active:scale-[0.98] dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  {row.cta}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <header className="border-b border-gray-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
            Top AI picks
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Highest likelihood first
          </p>
        </header>
        <div className="divide-y divide-gray-100 dark:divide-zinc-800">
          {top.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs leading-5 text-gray-500 dark:text-gray-400">
              Scores land here after the background worker runs.
            </p>
          ) : (
            top.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => onOpen(lead)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold text-white dark:bg-white dark:text-gray-900">
                  {initials(lead.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-gray-900 dark:text-white">
                    {lead.name}
                  </span>
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                    {lead.likelyScoreReason ?? lead.email}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  {lead.likelyScore}
                </span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ContactsView({
  leads,
  loading,
  onOpen,
}: {
  leads: Lead[];
  loading: boolean;
  onOpen: (l: Lead) => void;
}) {
  const [suppressedOnly, setSuppressedOnly] = useState(false);

  const suppressedCount = leads.filter((lead) => lead.emailSuppressed).length;

  // Suppressed contacts are the ones an admin has to act on, so they float to
  // the top of the full list instead of being buried alphabetically. Isolating
  // them shows every one, bypassing the 20-row cap that suits the full list.
  const visibleLeads = useMemo(() => {
    const pool = suppressedOnly ? leads.filter((lead) => lead.emailSuppressed) : leads;

    return [...pool]
      .sort((a, b) => {
        if (!suppressedOnly && a.emailSuppressed !== b.emailSuppressed) {
          return a.emailSuppressed ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, suppressedOnly ? suppressedCount : 20);
  }, [leads, suppressedOnly, suppressedCount]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
            Contact records
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {suppressedOnly
              ? `${suppressedCount} of ${leads.length} contacts have opted out of email`
              : `${leads.length} people in this workspace`}
          </p>
        </div>

        {suppressedCount > 0 && (
          <button
            type="button"
            onClick={() => setSuppressedOnly((current) => !current)}
            aria-pressed={suppressedOnly}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-all active:scale-[0.98]",
              suppressedOnly
                ? "bg-rose-600 text-white hover:bg-rose-500"
                : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25",
            )}
          >
            <Ban className="h-3.5 w-3.5" />
            {suppressedOnly ? "Show all contacts" : "Show suppressed only"}
            {!suppressedOnly && (
              <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-bold tabular-nums text-white">
                {suppressedCount}
              </span>
            )}
          </button>
        )}
      </header>
      <div className="divide-y divide-gray-100 dark:divide-zinc-800">
        {loading && leads.length === 0 ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="h-9 w-9 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/4 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                <div className="h-3 w-1/3 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
              </div>
            </div>
          ))
        ) : visibleLeads.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Ban className="mx-auto h-6 w-6 text-gray-300 dark:text-zinc-600" />
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No suppressed contacts
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">
              Everyone on the list can still receive email. Contacts appear here
              once a reply is classified as negative or unsubscribe.
            </p>
          </div>
        ) : (
          visibleLeads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => onOpen(lead)}
                className={cn(
                  "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/60",
                  lead.emailSuppressed && "bg-rose-50/50 dark:bg-rose-500/5",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                    lead.emailSuppressed
                      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300"
                      : "border-gray-200 bg-gray-50 text-gray-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-200",
                  )}
                >
                  {initials(lead.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {lead.name}
                  </span>
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                    {lead.email} {lead.source ? `from ${lead.source}` : ""}
                  </span>
                </span>
                {lead.emailSuppressed && (
                  <span
                    title="No email is sent to this contact until an administrator reactivates them"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-300"
                  >
                    <Ban className="h-3 w-3" />
                    Suppressed
                  </span>
                )}
                <span className="hidden shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 sm:block dark:bg-zinc-800 dark:text-zinc-300">
                  {lead.status}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-gray-400 dark:text-gray-400">
                  {formatRelative(lead.createdAt)}
                </span>
              </button>
            ))
        )}
      </div>
    </section>
  );
}

export default App;
