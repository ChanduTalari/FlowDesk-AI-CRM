import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import {
  changeFollowUpSequence,
  deleteFollowUpSequence,
  fetchLeadSequences,
  generateFollowUpSequence,
  getApiErrorMessage,
  updateFollowUpStep,
} from "../api/client";
import type {
  FollowUpSequence,
  FollowUpSequenceStatus,
  FollowUpStep,
  FollowUpStepStatus,
} from "../types/lead";
import { cn } from "../lib/cn";

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not scheduled";

/* Status identity: one tint per step state, shared by node, pill, and text. */
const STEP_STYLE: Record<FollowUpStepStatus, { node: string; pill: string }> = {
  Sent: {
    node: "border-emerald-500 bg-emerald-500 text-white dark:border-emerald-400 dark:bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  },
  Scheduled: {
    node: "border-sky-500 bg-sky-500 text-white dark:border-sky-400 dark:bg-sky-500",
    pill: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
  },
  Processing: {
    node: "border-sky-500 bg-sky-500 text-white dark:border-sky-400 dark:bg-sky-500",
    pill: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
  },
  Failed: {
    node: "border-rose-500 bg-rose-500 text-white dark:border-rose-400 dark:bg-rose-500",
    pill: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  },
  Draft: {
    node: "border-gray-300 bg-white text-gray-500 dark:border-gray-600 dark:bg-zinc-950 dark:text-gray-300",
    pill: "bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-zinc-800 dark:text-gray-300 dark:ring-zinc-600/30",
  },
  Skipped: {
    node: "border-gray-300 bg-white text-gray-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400",
    pill: "bg-gray-100 text-gray-500 ring-gray-500/20 dark:bg-zinc-800 dark:text-gray-400 dark:ring-zinc-600/30",
  },
  Cancelled: {
    node: "border-gray-300 bg-white text-gray-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400",
    pill: "bg-gray-100 text-gray-500 ring-gray-500/20 dark:bg-zinc-800 dark:text-gray-400 dark:ring-zinc-600/30",
  },
};

const SEQUENCE_PILL: Record<FollowUpSequenceStatus, string> = {
  Draft:
    "bg-gray-100 text-gray-600 ring-gray-500/20 dark:bg-zinc-800 dark:text-gray-300 dark:ring-zinc-600/30",
  Active:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  Paused:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  Completed:
    "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
  Cancelled:
    "bg-gray-100 text-gray-500 ring-gray-500/20 dark:bg-zinc-800 dark:text-gray-400 dark:ring-zinc-600/30",
};

/**
 * Follow-up timeline: sequences render as a vertical spine with one node
 * per step, so progress reads at a glance instead of as identical cards.
 * Light and dark share one hierarchy. Motion is hover and press only.
 */
export function FollowUpSequencePanel({ leadId }: { leadId: string }) {
  const [sequences, setSequences] = useState<FollowUpSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<FollowUpStep | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSequences(await fetchLeadSequences(leadId));
    } catch (caughtError) {
      setError(
        getApiErrorMessage(caughtError, "Unable to load follow-up sequences"),
      );
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (caughtError) {
      setError(
        getApiErrorMessage(caughtError, "Unable to update follow-up sequence"),
      );
    } finally {
      setBusy(false);
    }
  };

  const saveStep = async () => {
    if (!editingStep || !subject.trim() || !body.trim()) return;
    await run(async () => {
      await updateFollowUpStep(editingStep.sequenceId, editingStep.id, {
        subject,
        body,
      });
      setEditingStep(null);
    });
  };

  const cancelSequence = async (sequence: FollowUpSequence) => {
    setBusy(true);
    setError(null);
    setConfirmingCancelId(null);
    try {
      await deleteFollowUpSequence(sequence.id, "Cancelled by administrator");
      setSequences((current) =>
        current.filter((item) => item.id !== sequence.id),
      );
      await load();
    } catch (caughtError) {
      setError(
        getApiErrorMessage(caughtError, "Unable to cancel follow-up sequence"),
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  const hasLiveSequence = sequences.some((sequence) =>
    ["Draft", "Active", "Paused"].includes(sequence.status),
  );

  return (
    <section
      aria-label="Automated follow-up"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <header className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <CalendarClock className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
              Automated follow-up
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Three AI drafts at 2, 7, and 14 days. Approval is required before
              any email is sent.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void run(() => generateFollowUpSequence(leadId))}
          disabled={busy || loading || hasLiveSequence}
          className="h-10 shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Working" : "Generate sequence"}
        </button>
      </header>

      <div className="px-5 py-4">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
          >
            {error}
          </p>
        )}

        {loading && (
          <ol aria-label="Loading follow-up sequences" className="space-y-4">
            {[0, 1, 2].map((row) => (
              <li key={row} className="flex gap-3">
                <div className="h-7 w-7 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 w-1/3 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                  <div className="h-3 w-full animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
                </div>
              </li>
            ))}
          </ol>
        )}

        {!loading && sequences.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center dark:border-zinc-800">
            <CalendarClock className="mx-auto h-5 w-5 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No follow-up sequence yet
            </p>
            <p className="mx-auto mt-1 max-w-[26rem] text-xs leading-5 text-gray-500 dark:text-gray-400">
              Generate one to queue three reviewable drafts. Nothing sends until
              you approve the sequence.
            </p>
          </div>
        )}

        <div className="space-y-5">
          {sequences.map((sequence) => {
            const doneSteps = sequence.steps.filter(
              (step) => step.status === "Sent",
            ).length;
            const live = ["Draft", "Active", "Paused"].includes(
              sequence.status,
            );
            return (
              <article
                key={sequence.id}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-zinc-800 dark:bg-black"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                      SEQUENCE_PILL[sequence.status],
                    )}
                  >
                    {sequence.status}
                  </span>
                  <span
                    className="flex items-center gap-1.5"
                    aria-label={`Step ${doneSteps} of ${sequence.steps.length} sent`}
                  >
                    {sequence.steps.map((step, index) => (
                      <span
                        key={step.id}
                        aria-hidden="true"
                        className={cn(
                          "h-1.5 w-5 rounded-full",
                          index < doneSteps
                            ? "bg-emerald-500"
                            : "bg-gray-200 dark:bg-gray-700",
                        )}
                      />
                    ))}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-gray-400 dark:text-gray-400">
                    {doneSteps} of {sequence.steps.length} sent
                  </span>
                  <span className="w-full text-xs text-gray-500 dark:text-gray-400">
                    Next action {formatDate(sequence.nextActionAt)}
                  </span>
                  {sequence.pauseReason && (
                    <span className="w-full text-xs font-medium text-amber-600 dark:text-amber-400">
                      {sequence.pauseReason}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {sequence.status === "Draft" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          changeFollowUpSequence(sequence.id, "approve"),
                        )
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-[13px] font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" strokeWidth={2.2} />
                      Approve sequence
                    </button>
                  )}
                  {sequence.status === "Active" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          changeFollowUpSequence(
                            sequence.id,
                            "pause",
                            "Paused by administrator",
                          ),
                        )
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 text-[13px] font-semibold text-amber-700 transition-all hover:bg-amber-50 active:scale-[0.98] disabled:opacity-50 dark:border-amber-500/30 dark:bg-transparent dark:text-amber-300 dark:hover:bg-amber-500/10"
                    >
                      <Pause className="h-4 w-4" strokeWidth={2.2} />
                      Pause
                    </button>
                  )}
                  {sequence.status === "Paused" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          changeFollowUpSequence(sequence.id, "resume"),
                        )
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-[13px] font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" strokeWidth={2.2} />
                      Resume
                    </button>
                  )}
                  {live &&
                    (confirmingCancelId === sequence.id ? (
                      <span className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
                        Delete these scheduled emails?
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void cancelSequence(sequence)}
                          className="font-semibold underline"
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmingCancelId(null)}
                          className="font-semibold text-gray-600 underline dark:text-gray-300"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmingCancelId(sequence.id)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 text-[13px] font-semibold text-gray-600 transition-all hover:border-rose-300 hover:text-rose-700 active:scale-[0.98] disabled:opacity-50 dark:border-zinc-700 dark:bg-transparent dark:text-gray-300 dark:hover:border-rose-500/40 dark:hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                        Delete
                      </button>
                    ))}
                </div>

                <ol className="mt-4 space-y-0">
                  {sequence.steps.map((step, index) => {
                    const style = STEP_STYLE[step.status];
                    const isLast = index === sequence.steps.length - 1;
                    const isEditing = editingStep?.id === step.id;
                    return (
                      <li key={step.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                        {!isLast && (
                          <span
                            aria-hidden="true"
                            className="absolute left-[13px] top-8 h-[calc(100%-2rem)] w-px bg-gray-200 dark:bg-zinc-800"
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold tabular-nums",
                            style.node,
                          )}
                        >
                          {step.status === "Sent" ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                          ) : step.status === "Failed" ? (
                            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.4} />
                          ) : (
                            step.stepNumber
                          )}
                        </span>
                        <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-gray-700">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <span className="text-xs font-bold tabular-nums text-indigo-600 dark:text-indigo-300">
                              Day {Math.round(step.delayHours / 24)}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                                style.pill,
                              )}
                            >
                              {step.status}
                            </span>
                            <span className="ml-auto text-[11px] tabular-nums text-gray-400 dark:text-gray-400">
                              {formatDate(step.sentAt ?? step.scheduledAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                            {step.subject}
                          </p>
                          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">
                            {step.body}
                          </p>
                          {step.errorMessage && (
                            <p
                              role="alert"
                              className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                            >
                              {step.errorMessage}
                            </p>
                          )}
                          {sequence.status === "Draft" && !isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStep(step);
                                setSubject(step.subject);
                                setBody(step.body);
                              }}
                              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit step
                            </button>
                          )}
                          {isEditing && (
                            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3 dark:border-zinc-800">
                              <div>
                                <label
                                  htmlFor={`step-subject-${step.id}`}
                                  className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-200"
                                >
                                  Subject
                                </label>
                                <input
                                  id={`step-subject-${step.id}`}
                                  value={subject}
                                  onChange={(event) =>
                                    setSubject(event.target.value)
                                  }
                                  maxLength={255}
                                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                                />
                              </div>
                              <div>
                                <label
                                  htmlFor={`step-body-${step.id}`}
                                  className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-200"
                                >
                                  Message
                                </label>
                                <textarea
                                  id={`step-body-${step.id}`}
                                  value={body}
                                  onChange={(event) =>
                                    setBody(event.target.value)
                                  }
                                  rows={6}
                                  maxLength={10000}
                                  className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-700 outline-none transition-all placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-black dark:text-gray-200 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveStep()}
                                  disabled={
                                    busy || !subject.trim() || !body.trim()
                                  }
                                  className="h-9 rounded-xl bg-indigo-600 px-4 text-[13px] font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50"
                                >
                                  Save step
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingStep(null)}
                                  className="h-9 rounded-xl border border-gray-200 px-4 text-[13px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:text-gray-300 dark:hover:bg-zinc-800"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
