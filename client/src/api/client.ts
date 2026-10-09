import axios from "axios";
import { supabase } from "../lib/supabase";
import type {
  ApiErrorEnvelope,
  CreateLeadInput,
  FollowUpSequence,
  Lead,
  LeadAnalysis,
  LeadConversation,
  LeadEmailEvent,
  LeadListResponse,
  LeadStatus,
  SendLeadEmailInput,
  UpdateFollowUpStepInput,
} from "../types/lead";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api"
).replace(/\/$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    config.headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return config;
});

let clearingSession = false;

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (
      axios.isAxiosError<ApiErrorEnvelope>(error) &&
      error.response?.status === 401 &&
      !clearingSession
    ) {
      clearingSession = true;

      try {
        await supabase.auth.signOut({ scope: "local" });
      } finally {
        clearingSession = false;
      }
    }

    return Promise.reject(error);
  },
);

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<ApiErrorEnvelope>(error)) {
    return error.response?.data?.error?.message ?? error.message ?? fallback;
  }

  return error instanceof Error ? error.message : fallback;
};

export const fetchLeads = async (params?: {
  priority?: "All" | "High" | "Medium" | "Low" | "Unscored";
  needsFollowUp?: boolean;
  status?: LeadStatus;
}) => {
  const { data } = await api.get<LeadListResponse>("/leads", {
    params: { page: 1, limit: 100, ...params },
  });
  return data;
};

export const addLead = async (input: CreateLeadInput) => {
  const { data } = await api.post<{ data: Lead }>("/leads", input);
  return data.data;
};

export const updateLeadStatus = async (leadId: string, status: LeadStatus) => {
  const { data } = await api.patch<{ data: Lead }>(`/leads/${leadId}/status`, {
    status,
  });
  return data.data;
};

export const generateLeadAnalysis = async (leadId: string) => {
  const { data } = await api.post<{
    data: LeadAnalysis;
    meta?: { lead?: Lead };
  }>(`/leads/${leadId}/ai/analyze`, undefined, {
    timeout: 30_000,
  });
  return data;
};

export const sendLeadEmail = async (
  leadId: string,
  input: SendLeadEmailInput,
) => {
  const { data } = await api.post<{
    data: LeadEmailEvent;
    meta?: { lead?: Lead };
  }>(`/leads/${leadId}/emails/send`, input, { timeout: 30_000 });
  return data;
};

export const generateFollowUpSummary = async (leadId: string) => {
  const { data } = await api.post<{
    data: Lead["aiSummary"];
    meta: { lead: Lead };
  }>(`/leads/${leadId}/ai/summary`, undefined, { timeout: 30_000 });
  return data;
};

export const fetchLeadConversation = async (leadId: string) => {
  const { data } = await api.get<{ data: LeadConversation }>(
    `/leads/${leadId}/conversation`,
  );
  return data.data;
};

export const retryInboundClassification = async (messageId: string) => {
  await api.post(`/leads/inbound-messages/${messageId}/classify/retry`);
};

export const fetchLeadSequences = async (leadId: string) => {
  const { data } = await api.get<{ data: FollowUpSequence[] }>(
    `/leads/${leadId}/follow-up-sequences`,
  );
  return data.data;
};

export const generateFollowUpSequence = async (leadId: string) => {
  const { data } = await api.post<{ data: FollowUpSequence }>(
    `/leads/${leadId}/follow-up-sequences/generate`,
    undefined,
    { timeout: 30_000 },
  );
  return data.data;
};

export const updateFollowUpStep = async (
  sequenceId: string,
  stepId: string,
  input: UpdateFollowUpStepInput,
) => {
  const { data } = await api.patch<{ data: FollowUpSequence["steps"][number] }>(
    `/leads/follow-up-sequences/${sequenceId}/steps/${stepId}`,
    input,
  );
  return data.data;
};

export const changeFollowUpSequence = async (
  sequenceId: string,
  action: "approve" | "pause" | "resume",
  reason?: string,
) => {
  const { data } = await api.post<{ data: FollowUpSequence }>(
    `/leads/follow-up-sequences/${sequenceId}/${action}`,
    reason ? { reason } : undefined,
  );
  return data.data;
};

export const deleteFollowUpSequence = async (
  sequenceId: string,
  reason?: string,
) => {
  const { data } = await api.delete<{
    data: { id: string; leadId: string; deletedStepCount: number };
  }>(`/leads/follow-up-sequences/${sequenceId}`, {
    data: reason ? { reason } : undefined,
  });
  return data.data;
};

export const reactivateLeadEmail = async (leadId: string) => {
  const { data } = await api.post<{ data: Lead }>(
    `/leads/${leadId}/reactivate-email`,
  );
  return data.data;
};
