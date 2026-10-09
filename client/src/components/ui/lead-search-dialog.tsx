import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import type { Lead } from "@/types/lead";
import { cn } from "@/lib/cn";

interface LeadSearchDialogProps {
  open: boolean;
  leads: Lead[];
  onClose: () => void;
  onSelect: (lead: Lead) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Lead search overlay: typeahead across name, email, and source with
 * arrow-key selection and Enter to open. Backdrop and Escape close it.
 */
export function LeadSearchDialog({
  open,
  leads,
  onClose,
  onSelect,
}: LeadSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return leads.slice(0, 8);
    return leads
      .filter((lead) =>
        [lead.name, lead.email, lead.source ?? "", lead.status]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 8);
  }, [leads, query]);

  // Reset and focus each time the overlay opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const choose = (lead: Lead) => {
    onClose();
    onSelect(lead);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const lead = results[activeIndex];
      if (lead) choose(lead);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search leads"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div className="glass-pop relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 shadow-2xl dark:border-zinc-800">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 dark:border-zinc-800">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="lead-search-results"
            aria-activedescendant={
              results.length > 0 ? `lead-search-option-${activeIndex}` : undefined
            }
            aria-label="Search leads by name, email, or source"
            placeholder="Search name, email, or source"
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 focus-visible:outline-none dark:text-white"
          />
          <kbd className="hidden rounded-lg border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 sm:block dark:border-zinc-700 dark:text-gray-500">
            Esc
          </kbd>
        </div>

        <div
          id="lead-search-results"
          ref={listRef}
          role="listbox"
          aria-label="Lead results"
          className="max-h-[46vh] min-h-24 overflow-y-auto p-2"
        >
          {leads.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No leads loaded yet.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No leads match &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            results.map((lead, index) => (
              <button
                key={lead.id}
                id={`lead-search-option-${index}`}
                data-index={index}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(lead)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                  index === activeIndex
                    ? "bg-gray-100 dark:bg-zinc-800"
                    : "hover:bg-gray-50 dark:hover:bg-zinc-800/60",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-gray-200">
                  {initials(lead.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {lead.name}
                  </span>
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                    {lead.email}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-zinc-800 dark:text-gray-300">
                  {lead.status}
                </span>
                {index === activeIndex && (
                  <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                )}
              </button>
            ))
          )}
        </div>

        <footer className="flex items-center gap-4 border-t border-gray-200 px-4 py-2.5 text-[11px] text-gray-400 dark:border-zinc-800 dark:text-gray-500">
          <span>Up and Down to navigate</span>
          <span>Enter to open</span>
        </footer>
      </div>
    </div>
  );
}
