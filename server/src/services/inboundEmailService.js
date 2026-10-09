import { createHash } from "node:crypto";
import { supabase } from "../db/supabase.js";
import { AppError } from "../errors/AppError.js";
import { classifyInboundReply } from "./aiService.js";
import { cancelActiveSequencesForLead } from "./followUpSequenceService.js";

const headerValue = (headers, name) => {
  const match = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return match?.[1] ?? null;
};

const parseAddress = (value) => {
  const raw = String(value ?? "").trim();
  const angle = raw.match(/<([^>]+)>/);
  const email = (angle?.[1] ?? raw).trim().toLowerCase();
  const name = angle
    ? raw.slice(0, raw.indexOf("<")).trim().replace(/^"|"$/g, "")
    : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError(
      "Inbound email has an invalid sender",
      400,
      "INVALID_INBOUND_SENDER",
    );
  return { email, name };
};

const toInbound = (row) => ({
  id: row.id,
  leadId: row.lead_id,
  provider: row.provider,
  from: row.from_email,
  fromName: row.from_name,
  to: row.to_email,
  subject: row.subject,
  body: row.body_text,
  dkimStatus: row.dkim_status,
  spfStatus: row.spf_status,
  receivedAt: row.received_at,
  classificationStatus: row.classification_status,
  classification:
    row.classification_status === "Completed"
      ? {
          category: row.classification_category,
          sentiment: row.classification_sentiment,
          summary: row.classification_summary,
          confidence: row.classification_confidence,
          recommendedAction: row.classification_recommended_action,
          requiresHumanReview: row.classification_requires_review,
          shouldSuppressEmail: row.classification_suppresses_email,
        }
      : null,
  classificationError: row.classification_error,
});

export const parseSendGridPayload = (body) => {
  const sender = parseAddress(body.from);
  const recipient = parseAddress(body.to);
  const bodyText =
    String(body.text ?? "").trim() ||
    String(body.html ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  if (!bodyText)
    throw new AppError(
      "Inbound email body is required",
      400,
      "INBOUND_BODY_REQUIRED",
    );
  const parsedHeaders = String(body.headers ?? "")
    .split(/\r?\n/)
    .reduce((result, line) => {
      const separator = line.indexOf(":");
      if (separator > 0)
        result[line.slice(0, separator).trim()] = line
          .slice(separator + 1)
          .trim();
      return result;
    }, {});
  const messageId = headerValue(parsedHeaders, "Message-ID");
  const inReplyTo = headerValue(parsedHeaders, "In-Reply-To");
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        sender.email,
        recipient.email,
        messageId,
        body.subject,
        bodyText,
      ]),
    )
    .digest("hex");
  return {
    providerMessageId: messageId ?? `content:${fingerprint}`,
    messageId,
    inReplyTo,
    fromEmail: sender.email,
    fromName: sender.name,
    toEmail: recipient.email,
    subject: String(body.subject ?? "").slice(0, 500),
    bodyText: bodyText.slice(0, 100_000),
    rawHeaders: parsedHeaders,
    dkimStatus: String(body.dkim ?? "").slice(0, 50) || null,
    spfStatus: String(body.SPF ?? body.spf ?? "").slice(0, 50) || null,
    receivedAt: new Date().toISOString(),
  };
};

export const ingestInboundEmail = async (payload) => {
  const { data: existingByMessage } = await supabase
    .from("inbound_email_messages")
    .select("id, lead_id")
    .eq("provider", "sendgrid")
    .eq("provider_message_id", payload.providerMessageId)
    .maybeSingle();
  if (existingByMessage) {
    return {
      messageId: existingByMessage.id,
      leadId: existingByMessage.lead_id,
      duplicate: true,
    };
  }

  const { data: existingLead } = await supabase
    .from("leads")
    .select("*")
    .eq("email", payload.fromEmail)
    .maybeSingle();
  let lead = existingLead;
  let isNewLead = false;
  if (!lead) {
    const created = await supabase
      .from("leads")
      .insert({
        name: payload.fromName ?? payload.fromEmail.split("@")[0],
        email: payload.fromEmail,
        source: "Inbound Email",
        message: payload.bodyText,
        status: "New",
      })
      .select()
      .single();
    if (created.error || !created.data)
      throw new AppError(
        "Unable to create lead from inbound email",
        500,
        "INBOUND_LEAD_CREATE_FAILED",
      );
    lead = created.data;
    isNewLead = true;
  }

  const { data, error } = await supabase.rpc("record_inbound_message", {
    p_provider: "sendgrid",
    p_provider_message_id: payload.providerMessageId,
    p_message_id: payload.messageId,
    p_in_reply_to: payload.inReplyTo,
    p_from_email: payload.fromEmail,
    p_from_name: payload.fromName,
    p_to_email: payload.toEmail,
    p_subject: payload.subject,
    p_body_text: payload.bodyText,
    p_raw_headers: payload.rawHeaders,
    p_dkim_status: payload.dkimStatus,
    p_spf_status: payload.spfStatus,
    p_received_at: payload.receivedAt,
    p_lead_id: lead.id,
  });
  if (error || !data?.[0]?.message_id) {
    if (isNewLead) await supabase.from("leads").delete().eq("id", lead.id);
    throw new AppError(
      "Unable to persist inbound email",
      500,
      "INBOUND_MESSAGE_SAVE_FAILED",
    );
  }
  return {
    messageId: data[0].message_id,
    leadId: lead.id,
    duplicate: false,
    newLead: isNewLead,
  };
};

export const getInboundMessages = async (leadId) => {
  const { data, error } = await supabase
    .from("inbound_email_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("received_at", { ascending: false });
  if (error)
    throw new AppError(
      "Unable to load inbound messages",
      500,
      "INBOUND_MESSAGE_FETCH_FAILED",
    );
  return (data ?? []).map(toInbound);
};

export const getConversation = async (leadId) => {
  const [outbound, inbound] = await Promise.all([
    supabase
      .from("lead_email_events")
      .select("subject,body,sent_at,delivery_status")
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: true }),
    supabase
      .from("inbound_email_messages")
      .select("subject,body_text,received_at,from_email,classification_status")
      .eq("lead_id", leadId)
      .order("received_at", { ascending: true }),
  ]);
  if (outbound.error || inbound.error)
    throw new AppError(
      "Unable to load conversation",
      500,
      "CONVERSATION_FETCH_FAILED",
    );
  return [
    ...(outbound.data ?? []).map((row) => ({
      direction: "outbound",
      subject: row.subject,
      body: row.body,
      sentAt: row.sent_at,
      deliveryStatus: row.delivery_status,
    })),
    ...(inbound.data ?? []).map((row) => ({
      direction: "inbound",
      subject: row.subject,
      body: row.body_text,
      receivedAt: row.received_at,
      sender: row.from_email,
      classificationStatus: row.classification_status,
    })),
  ].sort(
    (first, second) =>
      new Date(first.sentAt ?? first.receivedAt) -
      new Date(second.sentAt ?? second.receivedAt),
  );
};

export const classifyStoredMessage = async (messageId) => {
  const { data: row, error } = await supabase
    .from("inbound_email_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();
  if (error || !row)
    throw new AppError(
      "Inbound message not found",
      404,
      "INBOUND_MESSAGE_NOT_FOUND",
    );
  await supabase
    .from("inbound_email_messages")
    .update({ classification_status: "Processing", classification_error: null })
    .eq("id", messageId);
  try {
    const result = await classifyInboundReply({
      subject: row.subject,
      from: row.from_email,
      to: row.to_email,
      body: row.body_text,
      receivedAt: row.received_at,
    });
    const { error: updateError } = await supabase
      .from("inbound_email_messages")
      .update({
        classification_status: "Completed",
        classification_category: result.category,
        classification_sentiment: result.sentiment,
        classification_summary: result.summary,
        classification_confidence: result.confidence,
        classification_recommended_action: result.recommendedAction,
        classification_requires_review: result.requiresHumanReview,
        classification_suppresses_email: result.shouldSuppressEmail,
        classified_at: new Date().toISOString(),
      })
      .eq("id", messageId);
    if (updateError) throw updateError;
    if (result.shouldSuppressEmail && row.lead_id) {
      await supabase
        .from("leads")
        .update({
          email_suppressed: true,
          email_suppressed_at: new Date().toISOString(),
        })
        .eq("id", row.lead_id);
      await cancelActiveSequencesForLead(
        row.lead_id,
        "Recipient requested no further email",
      );
    }
    return toInbound(row);
  } catch (classificationError) {
    await supabase
      .from("inbound_email_messages")
      .update({
        classification_status: "Failed",
        classification_error: String(
          classificationError?.message ?? classificationError,
        ).slice(0, 1000),
      })
      .eq("id", messageId);
    throw classificationError;
  }
};

export const retryClassification = async (messageId) => {
  const { data, error } = await supabase
    .from("background_jobs")
    .update({
      status: "Pending",
      run_at: new Date().toISOString(),
      last_error: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("dedupe_key", `inbound-classify:${messageId}`)
    .select("id")
    .maybeSingle();
  if (error || !data)
    throw new AppError(
      "Unable to retry inbound classification",
      500,
      "INBOUND_CLASSIFICATION_RETRY_FAILED",
    );
  return data;
};
