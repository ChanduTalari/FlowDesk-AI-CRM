import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleHelp,
  Clock,
  Globe,
  Mail,
  MessageSquare,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  generateFollowUpSummary,
  generateLeadAnalysis,
  getApiErrorMessage,
  reactivateLeadEmail,
  sendLeadEmail,
  updateLeadStatus,
} from "../api/client";
import { EmailHistory } from "./EmailHistory";
import { FollowUpSequencePanel } from "./FollowUpSequencePanel";
import { StatusBadge } from "./StatusBadge";
import { useLeads } from "../context/LeadContext";
import type {
  LeadAiSummary,
  LeadAnalysis,
  LeadStatus,
} from "../types/lead";

interface LeadDetailsProps {
  leadId: string;
  onClose: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** The next-step callout only renders for a real briefing with a usable action. */
const hasUsableNextAction = (summary: LeadAiSummary | null) =>
  Boolean(summary?.recommendedNextAction?.trim());

const formatDate = (value: string | null) => {
  if (!value) {
    return "Not contacted";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export function LeadDetails({ leadId, onClose }: LeadDetailsProps) {
  const { leads, replaceLead } = useLeads();
  const lead = leads.find((item) => item.id === leadId) ?? null;
  const briefing: LeadAiSummary | null = lead?.aiSummary ?? null;
  const hasBriefing = Boolean(briefing?.summary?.trim());
  const hasNextAction = hasUsableNextAction(briefing);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LeadAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const generateSummary = async () => {
    if (!lead || summaryLoading) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const result = await generateFollowUpSummary(lead.id);
      replaceLead(result.meta.lead);
    } catch (caughtError) {
      setSummaryError(
        getApiErrorMessage(caughtError, "Unable to generate AI briefing"),
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  const reactivateEmail = async () => {
    if (!lead) return;
    try {
      replaceLead(await reactivateLeadEmail(lead.id));
    } catch (caughtError) {
      setSummaryError(
        getApiErrorMessage(caughtError, "Unable to reactivate email"),
      );
    }
  };

  const changeStatus = async (status: LeadStatus) => {
    if (!lead || statusUpdating) {
      return;
    }

    setStatusUpdating(true);
    setStatusError(null);

    try {
      const updatedLead = await updateLeadStatus(lead.id, status);
      replaceLead(updatedLead);
    } catch (caughtError) {
      setStatusError(
        getApiErrorMessage(caughtError, "Unable to update lead status"),
      );
    } finally {
      setStatusUpdating(false);
    }
  };

  const createAnalysis = async () => {
    if (!lead || analysisLoading) {
      return;
    }

    setFollowupOpen(true);
    setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      const result = await generateLeadAnalysis(lead.id);
      const generatedAnalysis = result.data;
      setAnalysis(generatedAnalysis);
      if (result.meta?.lead) {
        replaceLead(result.meta.lead);
      }
      setDraftSubject(generatedAnalysis.subject);
      setDraftBody(generatedAnalysis.body);
      setSendSuccess(null);
    } catch (caughtError) {
      setAnalysisError(
        getApiErrorMessage(caughtError, "Unable to generate AI analysis"),
      );
    } finally {
      setAnalysisLoading(false);
    }
  };

  const sendDraft = async () => {
    if (!lead || sendingEmail || !draftSubject.trim() || !draftBody.trim()) {
      return;
    }

    setSendingEmail(true);
    setAnalysisError(null);
    setSendSuccess(null);

    try {
      const result = await sendLeadEmail(lead.id, {
        subject: draftSubject,
        body: draftBody,
      });
      if (result.meta?.lead) {
        replaceLead(result.meta.lead);
      }
      setDraftSubject("");
      setDraftBody("");
      setAnalysis(null);
      setSendSuccess("Email sent and recorded in email history.");
    } catch (caughtError) {
      setAnalysisError(
        getApiErrorMessage(caughtError, "Unable to send the email"),
      );
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Lead details"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-zinc-950"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-gray-200 px-5 py-4 dark:border-zinc-800 sm:px-6">
          {lead ? (
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-sm font-bold text-white shadow-sm"
            >
              {initials(lead.name)}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold tracking-tight text-gray-900 dark:text-white">
                {lead?.name ?? "Lead details"}
              </h2>
              {lead && <StatusBadge status={lead.status} />}
            </div>
            <p className="mt-0.5 truncate text-[13px] text-gray-500 dark:text-gray-400">
              {lead?.email ?? "This lead is no longer available."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close lead details"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        {lead && (
          <div className="nice-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="px-5 pt-5 text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
                Overview
              </h3>

              <dl className="mt-2 divide-y divide-gray-100 pb-2 dark:divide-zinc-800">
                {[
                  { icon: Mail, label: "Email", value: lead.email },
                  { icon: Globe, label: "Source", value: lead.source ?? "Not recorded" },
                  { icon: Clock, label: "Last contacted", value: formatDate(lead.lastContactedAt) },
                  { icon: CalendarDays, label: "Added", value: formatDate(lead.createdAt) },
                ].map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="flex items-center gap-3 px-5 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400">
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <dt className="w-28 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                        {row.label}
                      </dt>
                      <dd className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                        {row.value}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              {lead.likelyScore !== null && (
                <div className="mx-5 mb-5 mt-2 flex gap-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
                  <div className="shrink-0">
                    <p className="text-3xl font-bold tabular-nums tracking-tight text-indigo-700 dark:text-indigo-300">
                      {lead.likelyScore}
                      <span className="text-sm font-semibold text-indigo-400 dark:text-indigo-400">
                        /100
                      </span>
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500 dark:text-indigo-400">
                      AI score
                      {lead.priority && (
                        <span className="rounded-full bg-indigo-600 px-1.5 py-px text-[10px] font-bold normal-case tracking-normal text-white">
                          {lead.priority}
                        </span>
                      )}
                    </p>
                  </div>
                  {lead.likelyScoreReason && (
                    <>
                      <div
                        aria-hidden="true"
                        className="w-px shrink-0 bg-indigo-200/70 dark:bg-indigo-500/20"
                      />
                      <p className="min-w-0 text-[13px] leading-5 text-indigo-950 dark:text-indigo-100/90">
                        {lead.likelyScoreReason}
                      </p>
                    </>
                  )}
                </div>
              )}

              {lead.message && (
                <div className="px-5 pb-5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-400">
                    <MessageSquare className="h-3.5 w-3.5" />
                    First message
                  </p>
                  <blockquote className="mt-2 rounded-xl rounded-tl-sm border border-gray-200 border-l-2 border-l-indigo-500 bg-gray-50 p-4 text-sm leading-6 text-gray-700 dark:border-zinc-800 dark:border-l-indigo-400 dark:bg-black dark:text-gray-200">
                    <span className="whitespace-pre-wrap">{lead.message}</span>
                  </blockquote>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="px-5 pt-5">
                <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
                  Status workflow
                </h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {lead.status === "Closed"
                    ? "This lead is closed. Stages are locked."
                    : "Move the lead forward. Every change is validated by the backend."}
                </p>
              </div>

              <ol
                aria-label={`Lead stage: ${lead.status}`}
                className="flex items-center gap-1 px-5 pt-4"
              >
                {(["New", "Emailed", "Contacted", "Closed"] as const).map(
                  (stage, index, stages) => {
                    const order = stages.indexOf(lead.status as (typeof stages)[number]);
                    const done = index < order;
                    const current = stage === lead.status;
                    const closedStage = stage === "Closed";
                    return (
                      <li
                        key={stage}
                        className="flex min-w-0 flex-1 items-center gap-1 last:flex-none"
                        aria-current={current ? "step" : undefined}
                      >
                        <span className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className={
                              current
                                ? closedStage
                                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white dark:bg-white dark:text-gray-900"
                                  : "flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white ring-4 ring-indigo-100 dark:ring-indigo-500/20"
                                : done
                                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"
                                  : "flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-200 text-[10px] font-bold text-gray-400 dark:border-zinc-700 dark:text-gray-500"
                            }
                          >
                            {done && !current ? (
                              <Check className="h-3 w-3" strokeWidth={3} />
                            ) : (
                              index + 1
                            )}
                          </span>
                          <span
                            className={
                              current
                                ? "text-[11px] font-bold text-gray-900 dark:text-white"
                                : "truncate text-[11px] font-medium text-gray-400 dark:text-gray-500"
                            }
                          >
                            {stage}
                          </span>
                        </span>
                        {index < stages.length - 1 && (
                          <span
                            aria-hidden="true"
                            className={
                              index < order
                                ? "mb-5 h-px flex-1 bg-emerald-500"
                                : "mb-5 h-px flex-1 bg-gray-200 dark:bg-gray-700"
                            }
                          />
                        )}
                      </li>
                    );
                  },
                )}
              </ol>

              {lead.status !== "Closed" && (
                <div className="flex flex-col gap-2 px-5 pb-5 pt-4 sm:flex-row">
                  {["New", "Emailed"].includes(lead.status) && (
                    <button
                      type="button"
                      onClick={() => void changeStatus("Contacted")}
                      disabled={statusUpdating}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {statusUpdating ? "Updating" : "Mark contacted"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void changeStatus("Closed")}
                    disabled={statusUpdating}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
                  >
                    Close lead
                  </button>
                </div>
              )}

              {statusError && (
                <p role="alert" className="px-5 pb-5 text-sm text-red-600 dark:text-red-400">
                  {statusError}
                </p>
              )}
            </section>

            <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-indigo-500/[0.14] via-indigo-500/[0.05] to-transparent dark:from-indigo-500/[0.22] dark:via-indigo-500/[0.06] dark:to-transparent"
              />
              <div className="relative flex items-center gap-3 px-5 pt-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
                  <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
                      AI lead briefing
                    </h3>
                    {summaryLoading ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                        Generating
                      </span>
                    ) : hasBriefing ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        Ready
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Evidence, unknowns, and the recommended next action.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void generateSummary()}
                  disabled={summaryLoading}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-[13px] font-semibold text-white shadow-sm shadow-indigo-500/25 transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {summaryLoading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
                      Generating
                    </>
                  ) : hasBriefing ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
                      Refresh
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />
                      Generate
                    </>
                  )}
                </button>
              </div>

              <div className="relative px-5 py-4">
                {summaryError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                  >
                    {summaryError}
                  </p>
                )}

                {summaryLoading && !hasBriefing && (
                  <div className="space-y-2.5" aria-label="Generating briefing">
                    <div className="h-3.5 w-full animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                    <div className="h-3.5 w-11/12 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-zinc-800" />
                      <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-zinc-800" />
                    </div>
                  </div>
                )}

                {!summaryLoading && !hasBriefing && !summaryError && (
                  <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center dark:border-zinc-700">
                    <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                      <Sparkles className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <p className="mx-auto mt-3 max-w-[34ch] text-[13px] font-semibold text-gray-900 dark:text-white">
                      No briefing yet
                    </p>
                    <p className="mx-auto mt-1 max-w-[38ch] text-xs leading-5 text-gray-500 dark:text-gray-400">
                      Generate an evidence based brief with confirmed facts,
                      open gaps, and the next best step.
                    </p>
                  </div>
                )}

                {hasBriefing && briefing && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium leading-7 text-gray-800 dark:text-gray-100">
                      {briefing.summary}
                    </p>

                    {(briefing.observedFacts.length > 0 ||
                      briefing.unknowns.length > 0) && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {briefing.observedFacts.length > 0 && (
                          <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]">
                            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-300">
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
                              Confirmed
                            </p>
                            <ul className="mt-2 space-y-1.5">
                              {briefing.observedFacts.map((fact) => (
                                <li
                                  key={fact}
                                  className="flex gap-1.5 text-[13px] leading-5 text-gray-700 dark:text-gray-200"
                                >
                                  <Check
                                    className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                                    strokeWidth={2.5}
                                  />
                                  <span>{fact}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {briefing.unknowns.length > 0 && (
                          <div className="rounded-xl border border-sky-200/70 bg-sky-50/60 p-3.5 dark:border-sky-500/20 dark:bg-sky-500/[0.08]">
                            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-sky-700 dark:text-sky-300">
                              <CircleHelp
                                className="h-3.5 w-3.5"
                                strokeWidth={2}
                              />
                              Still unknown
                            </p>
                            <ul className="mt-2 space-y-1.5">
                              {briefing.unknowns.map((item) => (
                                <li
                                  key={item}
                                  className="flex gap-1.5 text-[13px] leading-5 text-gray-700 dark:text-gray-200"
                                >
                                  <CircleHelp
                                    className="mt-1 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400"
                                    strokeWidth={2}
                                  />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {hasNextAction && (
                      <div className="flex gap-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-4 shadow-lg shadow-indigo-500/20">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                          <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                            Recommended next step
                          </span>
                          <span className="mt-0.5 block text-[13px] font-medium leading-6 text-white">
                            {briefing.recommendedNextAction}
                          </span>
                        </span>
                      </div>
                    )}
                    {lead.aiSummaryGeneratedAt && (
                      <p className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                        <Clock className="h-3 w-3" />
                        Generated{" "}
                        {new Date(lead.aiSummaryGeneratedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {lead.emailSuppressed && (
                <div className="mx-5 mb-5 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                    Future email is suppressed
                  </p>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-300/90">
                    A reply requested no further email. Reactivate it only after
                    confirming consent.
                  </p>
                  <button
                    type="button"
                    onClick={() => void reactivateEmail()}
                    className="mt-3 h-9 rounded-xl border border-red-300 px-3 text-xs font-semibold text-red-800 transition-colors hover:bg-red-100 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                  >
                    Reactivate email
                  </button>
                </div>
              )}
            </section>

            <FollowUpSequencePanel leadId={lead.id} />

            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3 px-5 pt-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  <Send className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
                    Follow-up email
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Draft with AI, edit, then send.
                  </p>
                </div>
              </div>

              <div className="px-5 py-4">
                {analysisError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
                  >
                    {analysisError}
                  </div>
                )}

                {analysisLoading && (
                  <div className="space-y-2.5" aria-label="Generating draft">
                    <div className="h-4 w-1/3 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                    <div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-zinc-800" />
                  </div>
                )}

                {!analysisLoading && !analysis && !followupOpen && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={createAnalysis}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.98]"
                    >
                      <Sparkles className="h-4 w-4" strokeWidth={2} />
                      Generate draft with AI
                    </button>
                    <button
                      type="button"
                      onClick={() => setFollowupOpen(true)}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition-all hover:border-indigo-300 hover:text-indigo-700 active:scale-[0.98] dark:border-zinc-700 dark:text-gray-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={2} />
                      Write custom
                    </button>
                  </div>
                )}

                {!analysisLoading && analysis && !followupOpen && (
                  <article className="overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-black">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                        AI draft
                      </span>
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                        {analysis.analysis.priority} priority
                      </span>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
                        {analysis.subject}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                        To {lead.email}
                      </p>
                      <p className="mt-2.5 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-200">
                        {analysis.body}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
                          {analysis.analysis.intent}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
                          {analysis.analysis.sentiment}
                        </span>
                        {analysis.analysis.keyTopics.map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 dark:border-zinc-700 dark:text-gray-400"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2.5 rounded-lg bg-indigo-50/70 px-3 py-2 text-xs leading-5 text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">
                        <span className="font-semibold">Next: </span>
                        {analysis.analysis.recommendedNextAction}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 border-t border-gray-200 bg-gray-50/60 px-4 py-3 sm:flex-row dark:border-zinc-800 dark:bg-black/60">
                      <button
                        type="button"
                        onClick={() => void sendDraft()}
                        disabled={sendingEmail}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-[13px] font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
                        {sendingEmail ? "Sending" : "Send email"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFollowupOpen(true)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-700 transition-all hover:border-indigo-300 hover:text-indigo-700 active:scale-[0.98] dark:border-zinc-700 dark:bg-transparent dark:text-gray-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={createAnalysis}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                      >
                        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                        Regenerate
                      </button>
                    </div>
                  </article>
                )}

                {sendSuccess && !followupOpen && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {sendSuccess}
                  </div>
                )}

                {followupOpen && !analysisLoading && (
                  <div id="followup-content">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
                        {analysis ? "Edit draft" : "Write an email"}
                      </p>
                      <button
                        type="button"
                        onClick={() => setFollowupOpen(false)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                      >
                        Close editor
                      </button>
                    </div>

                    {analysis && (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                          {analysis.analysis.intent}
                        </span>
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                          {analysis.analysis.priority} priority
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-zinc-800 dark:text-gray-300">
                          {analysis.analysis.sentiment}
                        </span>
                      </div>
                    )}

                    <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-black">
                      <div>
                        <label
                          htmlFor="followup-subject"
                          className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400"
                        >
                          Subject
                        </label>
                        <input
                          id="followup-subject"
                          value={draftSubject}
                          onChange={(event) =>
                            setDraftSubject(event.target.value)
                          }
                          maxLength={255}
                          placeholder="Subject"
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition-all placeholder:font-normal placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="followup-body"
                          className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400"
                        >
                          Message
                        </label>
                        <textarea
                          id="followup-body"
                          value={draftBody}
                          onChange={(event) => setDraftBody(event.target.value)}
                          rows={8}
                          maxLength={10_000}
                          placeholder={`Write a message to ${lead.name}...`}
                          className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-700 outline-none transition-all placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-200 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                        />
                      </div>

                      {sendSuccess && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                          {sendSuccess}
                        </div>
                      )}

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => void sendDraft()}
                          disabled={
                            sendingEmail ||
                            !draftSubject.trim() ||
                            !draftBody.trim()
                          }
                          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Send className="h-4 w-4" strokeWidth={2.2} />
                          {sendingEmail ? "Sending" : "Send email"}
                        </button>
                        {!analysis && (
                          <button
                            type="button"
                            onClick={createAnalysis}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition-all hover:border-indigo-300 hover:text-indigo-700 active:scale-[0.98] dark:border-zinc-700 dark:bg-transparent dark:text-gray-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                          >
                            <Sparkles className="h-4 w-4" strokeWidth={2} />
                            Generate with AI instead
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Email history
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Delivery attempts and outcomes.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition-all hover:border-indigo-300 hover:text-indigo-700 active:scale-[0.98] dark:border-zinc-700 dark:text-gray-200 dark:hover:border-indigo-500/40 dark:hover:text-indigo-300"
                >
                  View history
                </button>
              </div>
            </section>
          </div>
        )}
      </aside>

      {historyOpen && lead && (
        <EmailHistory lead={lead} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  );
}
