import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { supabase } from "../db/supabase.js";
import { AppError } from "../errors/AppError.js";

class EmailService {
  constructor(config = {}) {
    const emailConfig = {
      host: config.host ?? env.email.host,
      port: config.port ?? env.email.port,
      secure: config.secure ?? env.email.port === 465,
      auth: {
        user: config.user ?? process.env.EMAIL_USER,
        pass: config.pass ?? process.env.EMAIL_PASS,
      },
    };

    this.transporter = nodemailer.createTransport({
      ...emailConfig,
      auth:
        emailConfig.auth.user && emailConfig.auth.pass
          ? emailConfig.auth
          : undefined,
    });
  }

  async sendMail(options) {
    const info = await this.transporter.sendMail(options);

    if (!info.accepted?.length) {
      throw new Error(
        info.rejected?.length
          ? `SMTP rejected recipients: ${info.rejected.map((item) => item.address).join(", ")}`
          : "SMTP server did not accept the message",
      );
    }

    return info;
  }

  async sendLeadEmail(lead, { subject, body }, options = {}) {
    if (lead.emailSuppressed) {
      throw new AppError(
        "Email is suppressed for this lead",
        409,
        "EMAIL_SUPPRESSED",
      );
    }

    const sentAt = new Date().toISOString();
    const from = env.email.fromName
      ? { address: env.email.from, name: env.email.fromName }
      : env.email.from;

    if (options.idempotencyKey) {
      const { data: existing } = await supabase
        .from("lead_email_events")
        .select("*")
        .eq("idempotency_key", options.idempotencyKey)
        .maybeSingle();
      if (existing?.delivery_status === "Sent") {
        return {
          id: existing.id,
          leadId: existing.lead_id,
          deliveryStatus: existing.delivery_status,
          recipient: existing.recipient,
          subject: existing.subject,
          body: existing.body,
          messageId: existing.message_id,
          errorMessage: existing.error_message,
          sentAt: existing.sent_at,
          createdAt: existing.created_at,
        };
      }
    }

    const { data: insertedEvent, error: queueError } = await supabase
      .from("lead_email_events")
      .upsert(
        {
          lead_id: lead.id,
          delivery_status: "Queued",
          recipient: lead.email,
          subject,
          body,
          sequence_step_id: options.sequenceStepId ?? null,
          idempotency_key: options.idempotencyKey ?? null,
        },
        {
          onConflict: "idempotency_key",
          ignoreDuplicates: true,
        },
      )
      .select()
      .maybeSingle();
    let queuedEvent = insertedEvent;

    if (queueError || !queuedEvent) {
      const { data: existing } = options.idempotencyKey
        ? await supabase
            .from("lead_email_events")
            .select("*")
            .eq("idempotency_key", options.idempotencyKey)
            .single()
        : { data: null };
      if (existing) {
        queuedEvent = existing;
      } else {
        throw new AppError(
          "Unable to queue email event",
          500,
          "EMAIL_QUEUE_FAILED",
        );
      }
    }

    if (queuedEvent.delivery_status === "Failed") {
      await supabase
        .from("lead_email_events")
        .update({ delivery_status: "Queued", error_message: null })
        .eq("id", queuedEvent.id);
      queuedEvent.delivery_status = "Queued";
    }

    try {
      const messageId = options.deterministicMessageId
        ? `<${options.deterministicMessageId}@ai-crm.local>`
        : undefined;
      const info = await this.sendMail({
        from,
        to: lead.email,
        subject,
        text: body,
        messageId,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;white-space:pre-wrap;">${escapeHtml(body)}</div>`,
      });

      const leadUpdatePayload = {
        last_contacted_at: sentAt,
        ...(options.sequenceStepId ? {} : { status: "Emailed" }),
      };
      const [eventUpdate, leadUpdate] = await Promise.all([
        supabase
          .from("lead_email_events")
          .update({
            delivery_status: "Sent",
            message_id: info.messageId ?? null,
            sent_at: sentAt,
          })
          .eq("id", queuedEvent.id),
        supabase.from("leads").update(leadUpdatePayload).eq("id", lead.id),
      ]);

      if (eventUpdate.error) {
        throw new AppError(
          "Email was sent, but its history could not be updated",
          500,
          "EMAIL_HISTORY_UPDATE_FAILED",
        );
      }

      if (leadUpdate.error) {
        console.error(
          `Email sent to ${lead.email}, but lead update failed:`,
          leadUpdate.error,
        );
      }

      return {
        id: queuedEvent.id,
        leadId: lead.id,
        deliveryStatus: "Sent",
        recipient: lead.email,
        subject,
        body,
        messageId: info.messageId ?? null,
        errorMessage: null,
        sentAt,
        createdAt: queuedEvent.created_at,
      };
    } catch (error) {
      await supabase
        .from("lead_email_events")
        .update({
          delivery_status: "Failed",
          error_message: toErrorMessage(error),
          sent_at: sentAt,
        })
        .eq("id", queuedEvent.id);
      throw error;
    }
  }

  async sendWelcomeEmail(lead) {
    const subject = "Welcome to our customer workflow";
    const sentAt = new Date().toISOString();
    const from = env.email.fromName
      ? { address: env.email.from, name: env.email.fromName }
      : env.email.from;

    // Persist the attempt before delivery so every outcome is auditable.
    const { data: queuedEvent, error: queueError } = await supabase
      .from("lead_email_events")
      .insert({
        lead_id: lead.id,
        delivery_status: "Queued",
        recipient: lead.email,
        subject,
      })
      .select()
      .single();

    if (queueError || !queuedEvent) {
      console.error("Unable to queue email event:", queueError);
      throw new AppError(
        "Unable to queue follow-up email",
        500,
        "EMAIL_QUEUE_FAILED",
      );
    }

    try {
      const info = await this.sendMail({
        from,
        to: lead.email,
        subject,
        text: [
          `Hi ${lead.name},`,
          "",
          "Thank you for contacting us. We have received your message and will follow up shortly.",
          "",
          `Your message: ${lead.message ?? "No message provided"}`,
          "",
          `Regards,
${env.email.fromName}`,
        ].join("\n"),
        html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;">
          <h2 style="margin-top:0;">Welcome, ${escapeHtml(lead.name)}</h2>
          <p>Thank you for contacting us. We have received your message and will follow up shortly.</p>
          ${
            lead.message
              ? `<p><strong>Your message:</strong><br />${escapeHtml(lead.message)}</p>`
              : ""
          }
          <p>Regards,<br />${escapeHtml(env.email.fromName)}</p>
        </div>
      `,
      });

      const [leadUpdate, eventUpdate] = await Promise.all([
        supabase
          .from("leads")
          .update({
            status: "Emailed",
            last_contacted_at: sentAt,
          })
          .eq("id", lead.id),
        supabase
          .from("lead_email_events")
          .update({
            delivery_status: "Sent",
            message_id: info.messageId ?? null,
            sent_at: sentAt,
          })
          .eq("id", queuedEvent.id),
      ]);

      if (eventUpdate.error) {
        console.error("Unable to update sent email event:", eventUpdate.error);
        throw new AppError(
          "Email was sent, but its history could not be updated",
          500,
          "EMAIL_HISTORY_UPDATE_FAILED",
        );
      }

      if (leadUpdate.error) {
        // Delivery succeeded, so the email must not be retried.
        console.error(
          `Email sent to ${lead.email}, but lead status update failed:`,
          leadUpdate.error,
        );
      }

      return { messageId: info.messageId ?? null };
    } catch (error) {
      const errorMessage = toErrorMessage(error);

      const { error: eventUpdateError } = await supabase
        .from("lead_email_events")
        .update({
          delivery_status: "Failed",
          error_message: errorMessage,
          sent_at: sentAt,
        })
        .eq("id", queuedEvent.id);

      if (eventUpdateError) {
        console.error("Unable to record failed email event:", eventUpdateError);
      }

      console.error(`Failed to send follow-up email to ${lead.email}:`, error);
      throw error;
    }
  }
}

const emailService = new EmailService();

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const toErrorMessage = (error) =>
  String(error instanceof Error ? error.message : error).slice(0, 1000);

export const sendLeadEmail = async (lead, { subject, body }, options = {}) =>
  emailService.sendLeadEmail(lead, { subject, body }, options);

export const sendWelcomeEmail = async (lead) =>
  emailService.sendWelcomeEmail(lead);
