import { useEffect, useRef, useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import { AddLeadForm } from "./AddLeadForm";
import { cn } from "../lib/cn";

interface NewLeadDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Lead capture dialog: scrim plus centered panel (bottom sheet on phones),
 * focus moves to the first field on open, Escape and scrim dismiss, and a
 * confirmation replaces the form after saving. Motion is a short panel
 * enter plus press feedback, collapsed under reduced motion.
 */
export function NewLeadDialog({ open, onClose }: NewLeadDialogProps) {
  const [visible, setVisible] = useState(false);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Mount the panel, then flip to its resting state on the next frame so
  // the enter transition actually runs. Skip the animation entirely when
  // the user prefers reduced motion.
  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    setCreatedName(null);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const frame = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => setVisible(true)),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [open ]);

  // Escape dismisses. Body scroll locks while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  // Focus the first field once the panel is resting.
  useEffect(() => {
    if (open && visible) {
      panelRef.current?.querySelector<HTMLElement>("input")?.focus();
    }
  }, [open, visible, formKey]);

  if (!open) return null;

  const addAnother = () => {
    setCreatedName(null);
    setFormKey((key) => key + 1);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-lead-title"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        className={cn(
          "nice-scroll relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-200 sm:max-w-lg sm:rounded-2xl dark:border-zinc-800 dark:bg-zinc-950",
          visible
            ? "translate-y-0 opacity-100 sm:scale-100"
            : "translate-y-4 opacity-0 sm:translate-y-2 sm:scale-[0.98]",
        )}
      >
        <header className="flex items-start gap-3 border-b border-gray-200 px-5 py-4 sm:px-6 dark:border-zinc-800">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            {createdName ? (
              <Check className="h-5 w-5" strokeWidth={2.2} />
            ) : (
              <UserPlus className="h-5 w-5" strokeWidth={2} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="new-lead-title"
              className="text-[17px] font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {createdName ? "Lead added" : "Add a lead"}
            </h2>
            <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">
              {createdName
                ? `${createdName} is in the pipeline.`
                : "AI scores the lead and drafts the first touch."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close add lead dialog"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-5 sm:px-6">
          {createdName ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                Follow-up email queued. Scoring runs in the background and the
                record appears in the list on the next sync.
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-[0.98] dark:border-zinc-700 dark:text-gray-200 dark:hover:bg-zinc-800"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={addAnother}
                  className="h-10 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.98]"
                >
                  Add another
                </button>
              </div>
            </div>
          ) : (
            <AddLeadForm
              key={formKey}
              bare
              idPrefix="new-lead"
              onCreated={(name) => setCreatedName(name || "New lead")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
