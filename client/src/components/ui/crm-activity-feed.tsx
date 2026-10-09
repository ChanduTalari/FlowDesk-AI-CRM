import { useMemo } from "react";
import { Clock, Mail, Sparkles, UserPlus, RefreshCw } from "lucide-react";
import type { Lead } from "@/types/lead";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";

interface CrmActivityFeedProps {
  leads: Lead[];
  loading: boolean;
  onOpenLead: (lead: Lead) => void;
}

interface FeedEvent {
  id: string;
  time: string;
  title: string;
  body: string;
  lead: Lead;
  icon: typeof Mail;
  tint: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function FeedSkeleton() {
  return (
    <div className="flex gap-3 px-5 py-3.5">
      <div className="h-8 w-8 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

/**
 * Real-time activity derived from lead timestamps.
 * Covers AI scoring, briefings, new arrivals, contact updates,
 * and overdue follow-ups. No invented events.
 */
export function CrmActivityFeed({ leads, loading, onOpenLead }: CrmActivityFeedProps) {
  const events = useMemo<FeedEvent[]>(() => {
    const out: FeedEvent[] = [];
    for (const lead of leads) {
      out.push({
        id: `${lead.id}-created`,
        time: lead.createdAt,
        title: "New lead assigned",
        body: `${lead.name} arrived from ${lead.source ?? "unknown source"}`,
        lead,
        icon: UserPlus,
        tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
      });
      if (lead.likelyScore !== null && lead.likelyScoreGeneratedAt) {
        out.push({
          id: `${lead.id}-scored`,
          time: lead.likelyScoreGeneratedAt,
          title: "AI scored a lead",
          body: `${lead.name} scored ${lead.likelyScore}/100`,
          lead,
          icon: Sparkles,
          tint: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
        });
      }
      if (lead.aiSummaryGeneratedAt) {
        out.push({
          id: `${lead.id}-brief`,
          time: lead.aiSummaryGeneratedAt,
          title: "AI briefing ready",
          body: `Briefing generated for ${lead.name}`,
          lead,
          icon: Sparkles,
          tint: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
        });
      }
      if (lead.lastContactedAt) {
        out.push({
          id: `${lead.id}-contact`,
          time: lead.lastContactedAt,
          title: `Moved to ${lead.status}`,
          body: `${lead.name} last contacted ${formatRelative(lead.lastContactedAt)}`,
          lead,
          icon: Mail,
          tint: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
        });
      } else if (lead.needsFollowUp) {
        out.push({
          id: `${lead.id}-due`,
          time: lead.createdAt,
          title: "Follow-up overdue",
          body: `${lead.name} needs attention`,
          lead,
          icon: Clock,
          tint: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
        });
      }
    }
    return out
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 9);
  }, [leads]);

  return (
    <section
      aria-label="Activity feed"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-zinc-800">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
            Activity
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            AI runs, arrivals, and stage changes
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          Live
        </span>
      </header>

      <div className="divide-y divide-gray-100 dark:divide-zinc-800">
        {loading && leads.length === 0 ? (
          <>
            <FeedSkeleton />
            <FeedSkeleton />
            <FeedSkeleton />
          </>
        ) : events.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <RefreshCw className="mx-auto h-5 w-5 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No activity yet
            </p>
            <p className="mx-auto mt-1 max-w-[13.75rem] text-xs leading-5 text-gray-500 dark:text-gray-400">
              Add a lead or wait for the next sync to fill this feed.
            </p>
          </div>
        ) : (
          events.map((event) => {
            const Icon = event.icon;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onOpenLead(event.lead)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/60"
              >
                <span className="relative shrink-0">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-200"
                  >
                    {initials(event.lead.name)}
                  </span>
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white dark:border-gray-900",
                      event.tint,
                    )}
                  >
                    <Icon className="h-2.5 w-2.5" strokeWidth={2.4} />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                    {event.title}
                  </span>
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                    {event.body}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-gray-400 dark:text-gray-400">
                  {formatRelative(event.time)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
