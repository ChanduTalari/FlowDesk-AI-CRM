import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { fetchLeads, getApiErrorMessage } from "../api/client";
import { useAuth } from "./AuthContext";
import type { Lead, LeadListMeta, LeadPriority } from "../types/lead";

interface LeadContextValue {
  leads: Lead[];
  meta: LeadListMeta;
  priority: LeadPriority | "All";
  needsFollowUp: boolean;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  replaceLead: (lead: Lead) => void;
  setPriority: (priority: LeadPriority | "All") => void;
  setNeedsFollowUp: (value: boolean) => void;
  resetFilters: () => void;
  filtersActive: boolean;
}

const LeadContext = createContext<LeadContextValue | undefined>(undefined);

export function LeadProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState<LeadPriority | "All">("All");
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [meta, setMeta] = useState<LeadListMeta>({
    totalLeads: 0,
    filteredLeadCount: 0,
    averageScore: 0,
    highPriorityCount: 0,
    unscoredCount: 0,
    overdueFollowUpCount: 0,
    suppressedCount: 0,
  });
  const refreshRequest = useRef<{
    key: string;
    promise: Promise<void>;
  } | null>(null);
  // Monotonic id so a slow earlier response can never overwrite the results
  // of a newer request (for example an unfiltered poll landing after a
  // queue filter was applied).
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    // Only coalesce calls that ask for the same slice of data. A filter
    // change must always issue its own request, otherwise a queue filter
    // applied while a poll was in flight would silently return the old
    // unfiltered list.
    const key = `${priority}|${needsFollowUp}`;
    const inFlight = refreshRequest.current;
    if (inFlight && inFlight.key === key) {
      return inFlight.promise;
    }

    requestSeq.current += 1;
    const seq = requestSeq.current;

    const request = (async () => {
      try {
        setRefreshing(true);
        setError(null);
        const result = await fetchLeads({
          priority,
          needsFollowUp: needsFollowUp || undefined,
        });
        if (seq === requestSeq.current) {
          setLeads(result.data);
          setMeta(result.meta);
        }
      } catch (caughtError) {
        if (seq === requestSeq.current) {
          setError(getApiErrorMessage(caughtError, "Unable to load leads"));
        }
      } finally {
        if (seq === requestSeq.current) {
          setRefreshing(false);
          setLoading(false);
        }
      }
    })();

    refreshRequest.current = { key, promise: request };

    try {
      await request;
    } finally {
      if (refreshRequest.current?.promise === request) {
        refreshRequest.current = null;
      }
    }
  }, [needsFollowUp, priority]);

  const resetFilters = useCallback(() => {
    setPriority("All");
    setNeedsFollowUp(false);
  }, []);

  const filtersActive = priority !== "All" || needsFollowUp;

  const replaceLead = useCallback((lead: Lead) => {
    setLeads((current) =>
      current.some((item) => item.id === lead.id)
        ? current.map((item) => (item.id === lead.id ? lead : item))
        : current,
    );
  }, []);

  useEffect(() => {
    if (!user) {
      setLeads([]);
      setLoading(false);
      setError(null);
      return;
    }

    void refresh();

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void refresh();
      }
    }, 20_000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh, user]);

  const value = useMemo(
    () => ({
      leads,
      meta,
      priority,
      needsFollowUp,
      filtersActive,
      loading,
      refreshing,
      error,
      refresh,
      replaceLead,
      setPriority,
      setNeedsFollowUp,
      resetFilters,
    }),
    [
      error,
      filtersActive,
      leads,
      loading,
      meta,
      needsFollowUp,
      priority,
      refresh,
      refreshing,
      replaceLead,
      resetFilters,
    ],
  );

  return <LeadContext.Provider value={value}>{children}</LeadContext.Provider>;
}

export function useLeads(): LeadContextValue {
  const context = useContext(LeadContext);

  if (!context) {
    throw new Error("useLeads must be used inside LeadProvider");
  }

  return context;
}
