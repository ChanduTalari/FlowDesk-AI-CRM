import { useState, type ChangeEvent, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { addLead, getApiErrorMessage } from "../api/client";
import { useLeads } from "../context/LeadContext";
import type { CreateLeadInput } from "../types/lead";

const initialForm: CreateLeadInput = {
  name: "",
  email: "",
  source: "Website",
  message: "",
};

interface AddLeadFormProps {
  /** Hide the card chrome and heading when embedded in a dialog. */
  bare?: boolean;
  /** Called with the new lead name after a successful create. */
  onCreated?: (name: string) => void;
  /** Prefix applied to field ids so inline and dialog copies never clash. */
  idPrefix?: string;
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20";

const labelClass =
  "mb-1 block text-sm font-medium text-slate-700 dark:text-gray-200";

export function AddLeadForm({ bare, onCreated, idPrefix = "lead" }: AddLeadFormProps) {
  const { refresh } = useLeads();
  const [form, setForm] = useState<CreateLeadInput>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const updateField = (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = event.currentTarget;
    setForm((current) => ({ ...current, [name]: value }));
    setSuccess(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(false);

      await addLead(form);
      await refresh();
      const createdName = form.name.trim();
      setForm(initialForm);
      setSuccess(true);
      onCreated?.(createdName);
    } catch (caughtError) {
      setError(getApiErrorMessage(caughtError, "Unable to add lead"));
    } finally {
      setSubmitting(false);
    }
  };

  const fields = (
    <>
      <div>
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          Name
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          value={form.name}
          onChange={updateField}
          required
          maxLength={255}
          placeholder="Jane Cooper"
          autoComplete="off"
          className={inputClass}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-email`} className={labelClass}>
            Email
          </label>
          <input
            id={`${idPrefix}-email`}
            name="email"
            type="email"
            value={form.email}
            onChange={updateField}
            required
            maxLength={255}
            placeholder="jane@example.com"
            autoComplete="off"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-source`} className={labelClass}>
            Source
          </label>
          <select
            id={`${idPrefix}-source`}
            name="source"
            value={form.source}
            onChange={updateField}
            required
            className={inputClass}
          >
            <option>Website</option>
            <option>LinkedIn</option>
            <option>Referral</option>
            <option>Advertisement</option>
            <option>Event</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-message`} className={labelClass}>
          Message
        </label>
        <textarea
          id={`${idPrefix}-message`}
          name="message"
          value={form.message}
          onChange={updateField}
          required
          maxLength={5000}
          rows={4}
          placeholder="Lead message or inquiry details"
          className={`${inputClass} resize-y`}
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          AI scores the lead and drafts the first touch after saving.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {success && !onCreated && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          Lead created and follow-up email queued.
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Adding lead..." : "Add lead"}
      </button>
    </>
  );

  if (bare) {
    return (
      <form className="space-y-4" onSubmit={submit}>
        {fields}
      </form>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
            <Plus className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Add a lead</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
              Queue a personalized follow-up email.
            </p>
          </div>
        </div>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        {fields}
      </form>
    </section>
  );
}
