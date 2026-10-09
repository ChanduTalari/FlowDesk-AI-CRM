import { useState, type FormEvent } from "react";
import { Columns3, Send, Sparkles } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { LogoTile } from "./Logo";

const highlights = [
  {
    icon: Sparkles,
    title: "AI lead scoring",
    body: "Every lead arrives ranked with a reason attached.",
  },
  {
    icon: Send,
    title: "Approval-gated follow-ups",
    body: "Drafts queue at 2, 7, and 14 days. Nothing sends unseen.",
  },
  {
    icon: Columns3,
    title: "Live pipeline",
    body: "Stages, activity, and triage refresh on every sync.",
  },
];

/**
 * Sign-in split: brand panel plus form card, using the same gray and
 * indigo system as the dashboard. Quiet enter, press feedback on the
 * submit, full light and dark parity.
 */
export function AuthGate() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await signIn(email, password);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to sign in",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4 py-10 dark:bg-black">
      <section
        aria-label="Sign in to FlowDesk"
        className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="relative flex flex-col overflow-hidden bg-[#070B16] px-7 py-8 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:px-9 sm:py-10 md:border-r md:border-white/10 dark:border-white/10 dark:bg-[#070B16]">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(120% 90% at 12% -5%, rgba(99,102,241,0.32), transparent 60%)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              maskImage:
                "linear-gradient(to bottom, black 40%, transparent 95%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 40%, transparent 95%)",
            }}
          />
          <div className="relative flex items-center gap-2.5">
            <LogoTile className="shadow-[0_0_24px_rgba(99,102,241,0.45)]" />
            <span>
              <span className="block text-sm font-semibold leading-4 tracking-tight">
                FlowDesk
              </span>
              <span className="block text-xs leading-4 text-indigo-200/70">
                AI CRM
              </span>
            </span>
          </div>

          <h1 className="relative mt-8 text-[26px] font-semibold leading-8 tracking-tight sm:text-3xl sm:leading-9">
            Pipeline, scoring, and{" "}
            <em className="text-indigo-300">follow-up</em> in one workspace.
          </h1>
          <p className="relative mt-2 max-w-[38ch] text-sm leading-6 text-gray-400">
            Sign in to pick up the queue where your team left it.
          </p>

          <ul className="relative mt-8 space-y-5">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-indigo-300">
                    <Icon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-gray-400">
                      {item.body}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="relative mt-auto hidden pt-8 text-xs text-gray-500 md:block">
            Invite-only workspace. Ask an admin for access.
          </p>
        </div>

        <div className="flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-12">
          <div className="mx-auto w-full max-w-sm">
          <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Sign in to open your workspace.
          </p>

          

          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <label
                htmlFor="auth-email"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-black dark:text-white dark:placeholder:text-gray-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20"
                placeholder="Your password"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
          </div>
        </div>
      </section>
    </main>
  );
}
