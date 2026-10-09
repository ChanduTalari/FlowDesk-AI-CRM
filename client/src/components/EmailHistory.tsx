import { useCallback, useEffect, useState } from "react";
import {
  fetchLeadConversation,
  getApiErrorMessage,
  retryInboundClassification,
} from "../api/client";
import type { Lead, LeadConversation } from "../types/lead";

const deliveryClass = {
  Queued:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  Sent: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  Failed:
    "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20",
};

interface EmailHistoryProps {
  lead: Lead;
  onClose: () => void;
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function EmailHistory({ lead, onClose }: EmailHistoryProps) {
  const [conversation, setConversation] = useState<LeadConversation | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setConversation(await fetchLeadConversation(lead.id));
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError, "Unable to load conversation"));
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-history-title"
      onClick={onClose}
    >
      <div
        className="nice-scroll max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-950"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2
              id="email-history-title"
              className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              Conversation
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {lead.name} · {lead.email}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close email history"
            className="rounded-xl px-2 py-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            Close
          </button>
        </div>

        {loading && (
          <div className="space-y-3 py-4" aria-label="Loading conversation">
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-gray-100 dark:bg-zinc-800" />
            <div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-zinc-800" />
            <div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-zinc-800" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && conversation?.messages.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No conversation activity has been recorded for this lead.
          </p>
        )}

        {!loading && !error && (conversation?.messages.length ?? 0) > 0 && (
          <div className="space-y-3">
            {conversation?.messages.map((message, index) => {
              const isInbound = message.direction === "inbound";
              const inbound = isInbound
                ? conversation.inbound.find(
                    (item) =>
                      item.subject === message.subject &&
                      item.body === message.body,
                  )
                : undefined;
              const outbound = !isInbound
                ? conversation.outbound.find(
                    (item) =>
                      item.subject === message.subject &&
                      item.body === message.body,
                  )
                : undefined;
              return (
                <article
                  key={`${message.direction}-${index}`}
                  className={`rounded-xl border p-4 ${isInbound ? "border-indigo-200 bg-indigo-50/40 dark:border-indigo-500/20 dark:bg-indigo-500/5" : "border-gray-200 dark:border-zinc-800"}`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {isInbound ? "Inbound reply" : "Outbound email"}
                      </p>
                      <p className="mt-1 font-medium text-gray-900 dark:text-white">
                        {message.subject || "(No subject)"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {isInbound
                          ? `${inbound?.from ?? message.sender} → ${inbound?.to}`
                          : `To ${outbound?.recipient}`}{" "}
                        ·{" "}
                        {formatDate(message.sentAt ?? message.receivedAt ?? "")}
                      </p>
                    </div>
                    {!isInbound && message.deliveryStatus && (
                      <span
                        className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${deliveryClass[message.deliveryStatus]}`}
                      >
                        {message.deliveryStatus}
                      </span>
                    )}
                  </div>
                  {message.body && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-200">
                      {message.body}
                    </p>
                  )}
                  {isInbound && inbound?.classification && (
                    <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-4 dark:border-indigo-500/20 dark:bg-zinc-950">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300">
                          {inbound.classification.category}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {inbound.classification.sentiment} ·{" "}
                          {Math.round(inbound.classification.confidence * 100)}%
                          confidence
                        </span>
                        {inbound.classification.requiresHumanReview && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                            Review required
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
                        {inbound.classification.summary}
                      </p>
                      <p className="mt-2 text-xs font-medium text-indigo-800 dark:text-indigo-300">
                        Next: {inbound.classification.recommendedAction}
                      </p>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        DKIM: {inbound.dkimStatus ?? "Unknown"} · SPF:{" "}
                        {inbound.spfStatus ?? "Unknown"}
                      </p>
                    </div>
                  )}
                  {isInbound && inbound?.classificationStatus === "Failed" && (
                    <button
                      type="button"
                      disabled={retrying === inbound.id}
                      onClick={() => {
                        setRetrying(inbound.id);
                        void retryInboundClassification(inbound.id)
                          .then(loadHistory)
                          .catch((caughtError) =>
                            setError(
                              getApiErrorMessage(
                                caughtError,
                                "Unable to retry classification",
                              ),
                            ),
                          )
                          .finally(() => setRetrying(null));
                      }}
                      className="mt-3 text-xs font-semibold text-indigo-600 dark:text-indigo-300"
                    >
                      {retrying === inbound.id
                        ? "Retrying..."
                        : "Retry AI classification"}
                    </button>
                  )}
                  {!isInbound && outbound?.errorMessage && (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                      {outbound.errorMessage}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
