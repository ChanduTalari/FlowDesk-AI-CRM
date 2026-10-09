import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Contact,
  LayoutDashboard,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { LogoTile } from "../Logo";

export type CrmNavId =
  | "overview"
  | "leads"
  | "pipeline"
  | "automations"
  | "contacts";

export interface CrmNavItem {
  id: CrmNavId;
  label: string;
  icon: LucideIcon;
}

/**
 * Sidebar badges never report how many records a view contains — that count
 * already lives in the "Total leads" card in the top bar. They report how many
 * records need attention, so each one carries its own wording and urgency tone
 * instead of rendering as a bare, unlabelled number.
 */
export type CrmBadgeTone = "warn" | "info" | "danger";

export interface CrmNavBadge {
  count: number;
  /** Full phrase describing what the count means, e.g. "3 need follow-up". */
  note: string;
  tone: CrmBadgeTone;
}

const BADGE_TONE: Record<CrmBadgeTone, { active: string; idle: string; dot: string }> = {
  warn: {
    active: "bg-amber-500 text-white",
    idle:
      "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25",
    dot: "bg-amber-500",
  },
  info: {
    active: "bg-white/25 text-white dark:bg-black/35",
    idle: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    dot: "bg-indigo-500",
  },
  danger: {
    active: "bg-white/25 text-white dark:bg-black/35",
    idle: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
  },
};

export interface CrmNotification {
  id: string;
  title: string;
  body: string;
  time: string | null;
  kind: "ai" | "lead" | "stage" | "followup";
}

interface DashboardLayoutProps {
  active: CrmNavId;
  onNavigate: (view: CrmNavId) => void;
  title: string;
  subtitle?: string;
  userEmail: string;
  syncing: boolean;
  notifications: CrmNotification[];
  onRefresh: () => void;
  onNewLead: () => void;
  onSignOut: () => void;
  onDismissNotification?: (id: string) => void;
  onClearNotifications?: (ids: string[]) => void;
  totalLeads: number;
  onOpenSearch?: () => void;
  badgeCounts?: Partial<Record<CrmNavId, CrmNavBadge>>;
  children: ReactNode;
}

const COLLAPSE_KEY = "flowdesk.dashboard.collapsed";
const THEME_KEY = "flowdesk.theme";

const DEFAULT_NAV: CrmNavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "leads", label: "Leads", icon: Users },
  { id: "pipeline", label: "Pipeline", icon: Columns3 },
  { id: "automations", label: "AI Automations", icon: Sparkles },
  { id: "contacts", label: "Contact Records", icon: Contact },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === "dark") return true;
      if (stored === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      // Storage or media queries unavailable (private mode, sandbox).
      // Render light and let the toggle work in memory.
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute("content", dark ? "#000000" : "#f8fafc");
    }
    try {
      window.localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      // storage unavailable, keep in-memory theme only
    }
  }, [dark]);

  return { dark, toggle: () => setDark((v) => !v) };
}

const KIND_DOT: Record<CrmNotification["kind"], string> = {
  ai: "bg-indigo-500",
  lead: "bg-emerald-500",
  stage: "bg-sky-500",
  followup: "bg-amber-500",
};

/**
 * Collapsible CRM shell.
 * Inspired by icon-rail dashboard layouts: expanded rail shows labels
 * plus notification badges, collapsed rail keeps icons only with tooltips.
 * Built with Tailwind transitions and full light/dark parity.
 */
export function DashboardLayout({
  active,
  onNavigate,
  title,
  subtitle,
  userEmail,
  syncing,
  notifications,
  onRefresh,
  onNewLead,
  onSignOut,
  onDismissNotification,
  onClearNotifications,
  totalLeads,
  onOpenSearch,
  badgeCounts,
  children,
}: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { dark, toggle } = useTheme();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // ignore persistence failure
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const navItems = useMemo(
    () =>
      DEFAULT_NAV.map((item) => {
        const badge = badgeCounts?.[item.id];
        const visible = badge && badge.count > 0 ? badge : null;
        // Spell the badge out in prose so the number is never mistaken for a
        // record count belonging to the view it sits beside.
        const described = visible
          ? `${item.label}, ${visible.note}`
          : item.label;

        return { ...item, badge: visible, described };
      }),
    [badgeCounts],
  );

  const go = (id: CrmNavId) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  const sidebarBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-gray-200 px-3 dark:border-zinc-800">
        <LogoTile />
        {!collapsed && (
          <span className="hidden min-w-0 flex-1 md:block">
            <span className="block truncate text-sm font-semibold tracking-tight text-gray-900 dark:text-white">
              FlowDesk
            </span>
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
              AI CRM
            </span>
          </span>
        )}
      </div>

      <nav aria-label="CRM sections" className="nice-scroll flex-1 overflow-y-auto px-2 py-4">
        
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.described}
                  title={item.described}
                  className={cn(
                    "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    collapsed && "justify-center px-0",
                    isActive
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-zinc-800 dark:hover:text-white",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                  {!collapsed && (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left">
                        {item.label}
                      </span>
                      {item.badge && (
                        <span
                          title={item.described}
                          className={cn(
                            "flex h-5 shrink-0 items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2 text-[11px] font-bold tabular-nums",
                            isActive
                              ? BADGE_TONE[item.badge.tone].active
                              : BADGE_TONE[item.badge.tone].idle,
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              isActive ? "bg-white/80" : BADGE_TONE[item.badge.tone].dot,
                            )}
                          />
                          {item.badge.count > 99 ? "99+" : item.badge.count}
                        </span>
                      )}
                    </>
                  )}
                  {collapsed && item.badge && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute ml-7 mt-[-22px] flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-zinc-950",
                        item.badge.tone === "warn"
                          ? "bg-amber-500"
                          : item.badge.tone === "danger"
                            ? "bg-rose-500"
                            : "bg-indigo-600",
                      )}
                    >
                      {item.badge.count > 9 ? "9+" : item.badge.count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-gray-200 p-3 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[11px] font-bold text-white dark:bg-white dark:text-gray-900"
          >
            {initials(userEmail.split("@")[0].replace(/[._-]+/g, " "))}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-gray-900 dark:text-gray-100">
                {userEmail}
              </span>
              <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                Administrator
              </span>
            </span>
          )}
        </div>
        <div className={cn("mt-2 flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              Sign out
            </button>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 md:inline-flex dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh] overflow-x-clip bg-gray-50 text-gray-900 antialiased dark:bg-black dark:text-gray-100">
      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] md:hidden"
        />
      )}

      <aside
        aria-label="Primary"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] dark:border-zinc-800 dark:bg-zinc-950",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          "md:sticky md:top-0 md:z-10 md:h-screen md:translate-x-0 md:shadow-none",
          collapsed ? "md:w-16" : "md:w-64",
        )}
      >
        <div className="absolute right-2 top-2 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {sidebarBody}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-bar sticky top-0 z-20 border-b border-gray-200 dark:border-zinc-800">
          <div className="flex h-16 items-center gap-2 px-3 sm:px-4">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-zinc-800"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate("leads")}
              title="View all leads"
              aria-label={`View all leads, ${totalLeads} total`}
              className="group flex h-12 items-center gap-3 rounded-xl border border-gray-200 bg-white py-1 pl-1.5 pr-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-indigo-200 hover:shadow-md active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-indigo-500/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
                <Users className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-[10px] font-bold uppercase leading-3 tracking-[0.14em] text-gray-400 dark:text-gray-400">
                  Total leads
                </span>
                <span className="mt-0.5 block text-xl font-bold leading-6 tabular-nums tracking-tight text-gray-900 dark:text-white">
                  {totalLeads}
                </span>
              </span>
            </button>

            <div className="min-w-0 flex-1 px-1">
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-gray-900 dark:text-white">
                {title}
              </h1>
              {subtitle && (
                <p className="hidden truncate text-xs text-gray-500 sm:block dark:text-gray-400">
                  {subtitle}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenSearch}
              className="hidden h-10 w-56 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 text-left text-sm text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600 lg:flex xl:w-64 dark:border-zinc-800 dark:bg-black dark:hover:border-gray-700 dark:hover:text-gray-300"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">Search leads</span>
              <kbd className="rounded-lg border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-gray-400">
                Ctrl K
              </kbd>
            </button>

            <span
              className={cn(
                "hidden h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium sm:flex",
                syncing
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300"
                  : "border-gray-200 bg-gray-50 text-gray-600 dark:border-zinc-800 dark:bg-black dark:text-gray-300",
              )}
              title={syncing ? "Syncing lead data" : "Live lead data"}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  syncing ? "animate-pulse bg-indigo-500" : "bg-emerald-500",
                )}
              />
              {syncing ? "Syncing" : "Live"}
            </span>

            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh data"
              className="hidden h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:inline-flex dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <RefreshCw className={cn("h-[18px] w-[18px]", syncing && "animate-spin")} />
            </button>

            <button
              type="button"
              onClick={onOpenSearch}
              aria-label="Search leads"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 lg:hidden dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>

            <button
              type="button"
              onClick={toggle}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label={`Open notifications, ${notifications.length} unread`}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <Bell className="h-[18px] w-[18px]" />
              {notifications.length > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white">
                  {notifications.length > 9 ? "9+" : notifications.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onNewLead}
              className="hidden h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.98] sm:inline-flex"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              New lead
            </button>
            <button
              type="button"
              onClick={onNewLead}
              aria-label="Add lead"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-95 sm:hidden"
            >
              <Plus className="h-5 w-5" strokeWidth={2.2} />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-4 md:px-6 md:py-6">
            {children}
          </div>
        </main>
      </div>

      {notifOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Notifications">
          <div
            aria-hidden="true"
            onClick={() => setNotifOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-gray-200 bg-white shadow-2xl transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3.5 dark:border-zinc-800">
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
                  Notifications
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {notifications.length === 0
                    ? "No updates from this workspace"
                    : `${notifications.length} update${notifications.length === 1 ? "" : "s"} from this workspace`}
                </p>
              </div>
              {notifications.length > 0 && onClearNotifications && (
                <button
                  type="button"
                  onClick={() => onClearNotifications(notifications.map((item) => item.id))}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Clear all
                </button>
              )}
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setNotifOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="nice-scroll flex-1 overflow-y-auto p-3">
              {notifications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center dark:border-zinc-800">
                  <Bell className="mx-auto h-6 w-6 text-gray-300 dark:text-gray-600" />
                  <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                    All caught up
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    New scores, replies, and overdue follow-ups will land here.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {notifications.map((item) => (
                    <li
                      key={item.id}
                      className="group flex gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 transition-colors hover:border-gray-300 dark:border-zinc-800 dark:bg-black dark:hover:border-gray-700"
                    >
                      <span
                        aria-hidden="true"
                        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", KIND_DOT[item.kind])}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-5 text-gray-900 dark:text-white">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                          {item.body}
                        </span>
                        {item.time && (
                          <span className="mt-1 block text-[11px] font-medium text-gray-400 dark:text-gray-400">
                            {formatRelative(item.time)}
                          </span>
                        )}
                      </span>
                      {onDismissNotification && (
                        <button
                          type="button"
                          aria-label={`Dismiss ${item.title}`}
                          onClick={() => onDismissNotification(item.id)}
                          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-md text-gray-300 opacity-0 transition-all hover:bg-gray-200 hover:text-gray-600 focus-visible:opacity-100 group-hover:opacity-100 dark:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-gray-300"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
