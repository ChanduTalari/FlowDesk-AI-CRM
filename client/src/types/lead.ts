export type LeadStatus = "New" | "Emailed" | "Contacted" | "Closed";
export type LeadPriority = "High" | "Medium" | "Low" | "Unscored";
export type EmailDeliveryStatus = "Queued" | "Sent" | "Failed";
export type InboundClassificationStatus =
  | "Pending"
  | "Processing"
  | "Completed"
  | "Failed";
export type ReplyCategory =
  | "Positive sales interest"
  | "Question/support"
  | "Negative/unsubscribe"
  | "Out of office"
  | "Meeting request";
export type FollowUpSequenceStatus =
  | "Draft"
  | "Active"
  | "Paused"
  | "Completed"
  | "Cancelled";
export type FollowUpStepStatus =
  | "Draft"
  | "Scheduled"
  | "Processing"
  | "Sent"
  | "Failed"
  | "Skipped"
  | "Cancelled";

export interface LeadAiSummary {
  summary: string;
  observedFacts: string[];
  unknowns: string[];
  recommendedNextAction: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  source: string | null;
  message: string | null;
  status: LeadStatus;
  lastContactedAt: string | null;
  likelyScore: number | null;
  likelyScoreReason: string | null;
  likelyScoreGeneratedAt: string | null;
  likelyScoreModel: string | null;
  aiSummary: LeadAiSummary | null;
  aiSummaryGeneratedAt: string | null;
  aiSummaryModel: string | null;
  emailSuppressed: boolean;
  createdAt: string;
  priority?: LeadPriority;
  needsFollowUp?: boolean;
}

export interface CreateLeadInput {
  name: string;
  email: string;
  source: string;
  message: string;
}

export interface LeadEmailEvent {
  id: string;
  leadId: string;
  deliveryStatus: EmailDeliveryStatus;
  recipient: string;
  subject: string;
  body: string | null;
  messageId: string | null;
  errorMessage: string | null;
  sentAt: string;
  createdAt: string;
}

export interface InboundClassification {
  category: ReplyCategory;
  sentiment: "Positive" | "Neutral" | "Negative";
  summary: string;
  confidence: number;
  recommendedAction: string;
  requiresHumanReview: boolean;
  shouldSuppressEmail: boolean;
}

export interface InboundEmailMessage {
  id: string;
  leadId: string | null;
  provider: string;
  from: string;
  fromName: string | null;
  to: string;
  subject: string;
  body: string;
  dkimStatus: string | null;
  spfStatus: string | null;
  receivedAt: string;
  classificationStatus: InboundClassificationStatus;
  classification: InboundClassification | null;
  classificationError: string | null;
}

export interface ConversationMessage {
  direction: "inbound" | "outbound";
  subject: string;
  body: string | null;
  sender?: string;
  deliveryStatus?: EmailDeliveryStatus;
  sentAt?: string;
  receivedAt?: string;
  classificationStatus?: InboundClassificationStatus;
}

export interface LeadConversation {
  messages: ConversationMessage[];
  outbound: LeadEmailEvent[];
  inbound: InboundEmailMessage[];
}

export interface FollowUpStep {
  id: string;
  sequenceId: string;
  stepNumber: number;
  delayHours: number;
  subject: string;
  body: string;
  status: FollowUpStepStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  emailEventId: string | null;
  attemptCount: number;
  errorMessage: string | null;
}

export interface FollowUpSequence {
  id: string;
  leadId: string;
  status: FollowUpSequenceStatus;
  currentStep: number;
  nextActionAt: string | null;
  pauseReason: string | null;
  approvedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: FollowUpStep[];
}

export interface LeadListMeta {
  totalLeads: number;
  filteredLeadCount: number;
  averageScore: number;
  highPriorityCount: number;
  unscoredCount: number;
  overdueFollowUpCount: number;
  suppressedCount: number;
}

export interface LeadListResponse {
  data: Lead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta: LeadListMeta;
}

export interface LeadAnalysis {
  subject: string;
  body: string;
  analysis: {
    intent: string;
    priority: "Low" | "Medium" | "High";
    sentiment: "Positive" | "Neutral" | "Negative";
    keyTopics: string[];
    recommendedNextAction: string;
    likelyScore: number;
    scoreReason: string;
  };
}

export interface SendLeadEmailInput {
  subject: string;
  body: string;
}
export interface UpdateFollowUpStepInput {
  subject: string;
  body: string;
}

export interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field?: string; message?: string }>;
  };
}
