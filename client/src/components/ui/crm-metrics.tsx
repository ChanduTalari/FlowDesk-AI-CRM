import { ArrowDownRight, ArrowUpRight, Target, Users, Zap } from "lucide-react";
import type { Lead, LeadListMeta } from "@/types/lead";
import { cn } from "@/lib/cn";

interface CrmMetricsProps {
  leads: Lead[];
  meta: LeadListMeta;
  loading: boolean;
}

function MetricSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="h-9 w-9 animate-pulse rounded-xl bg-gray-100 dark:bg-zinc-800" />
      <div className="mt-4 h-3 w-24 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
      <div className="mt-2 h-7 w-20 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
    </div>
  );
}

/**
 * Metric grid mapped from live CRM outputs: counts, rates, and AI
 * coverage only. No monetary figures are derived anywhere in this app.
 */
export function CrmMetrics({ leads, meta, loading }: CrmMetricsProps) {
  if (loading && leads.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <MetricSkeleton key={i} />
        ))}
      </div>
    );
  }

  const inView = leads.length;
  const active = leads.filter((l) => l.status !== "Closed").length;
  const closed = leads.filter((l) => l.status === "Closed").length;
  const scored = leads.filter((l) => l.likelyScore !== null).length;
  const conversion = inView > 0 ? (closed / inView) * 100 : 0;
  const responseRate = inView > 0 ? (scored / inView) * 100 : 0;

  const cards = [
    {
      label: "Active leads",
      value: String(inView > 0 ? active : meta.totalLeads),
      caption:
        inView > 0
          ? `${closed} closed in current view`
          : "Awaiting first sync",
      icon: Users,
      tint: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
      delta: meta.overdueFollowUpCount > 0 ? "down" : "up",
      deltaText: `${meta.overdueFollowUpCount} overdue`,
    },
    {
      label: "Conversion rate",
      value: `${conversion.toFixed(1)}%`,
      caption: `${closed} won from ${inView} in view`,
      icon: Target,
      tint: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
      delta: conversion >= 20 ? "up" : "flat",
      deltaText: `Avg score ${meta.averageScore}`,
    },
    {
      label: "AI response rate",
      value: `${responseRate.toFixed(1)}%`,
      caption: `${scored} of ${inView} scored by AI`,
      icon: Zap,
      tint: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
      delta: meta.unscoredCount > 0 ? "down" : "up",
      deltaText: `${meta.unscoredCount} awaiting score`,
    },
  ];

  return (
    <section aria-label="Pipeline metrics">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.label}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl",
                    card.tint,
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <span className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:border-zinc-800 dark:text-gray-400">
                  {card.delta === "up" ? (
                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                  ) : card.delta === "down" ? (
                    <ArrowDownRight className="h-3 w-3 text-amber-500" />
                  ) : null}
                  {card.deltaText}
                </span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-400">
                {card.label}
              </p>
              <p className="mt-1 text-[28px] font-bold leading-8 tracking-tight text-gray-900 tabular-nums dark:text-white">
                {card.value}
              </p>
              <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                {card.caption}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
