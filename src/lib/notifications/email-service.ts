/**
 * PT Trukindo Logistik Prima — Transactional Email Service
 * Sends automated confirmation receipts and notifications.
 * 
 * Uses Resend API with fail-safe non-blocking resilience:
 * - When RESEND_API_KEY is present, dispatches via HTTP to api.resend.com/emails
 * - When unconfigured, safely simulates delivery in development/test without throwing
 */

import {
  InquiryConfirmationData,
  renderInquiryConfirmationHtml,
  renderInquiryConfirmationText,
} from "../email-templates/inquiry-confirmation";
import { getConfig } from "../config";

export interface SendEmailResult {
  success: boolean;
  simulated?: boolean;
  messageId?: string;
  error?: string;
}

export async function sendInquiryConfirmationEmail(
  data: InquiryConfirmationData,
  options?: {
    apiKey?: string;
    from?: string;
  }
): Promise<SendEmailResult> {
  let apiKey = options?.apiKey;
  let fromAddress = options?.from;

  try {
    const config = getConfig();
    if (!apiKey) apiKey = config.RESEND_API_KEY;
    if (!fromAddress) fromAddress = config.EMAIL_FROM;
  } catch {
    if (!apiKey) apiKey = process.env.RESEND_API_KEY;
    if (!fromAddress) {
      fromAddress =
        process.env.EMAIL_FROM || "PT Trukindo Logistik Prima <inquiry@trukindo.co.id>";
    }
  }

  const subject = `Konfirmasi Permintaan Penawaran [${data.referenceNumber}] - PT Trukindo Logistik Prima`;
  const html = renderInquiryConfirmationHtml(data);
  const text = renderInquiryConfirmationText(data);

  // If no API key configured, simulate delivery gracefully
  if (!apiKey) {
    console.info(
      `[EmailService] RESEND_API_KEY not configured. Simulated confirmation email to ${data.contactEmail} for ${data.referenceNumber}`
    );
    return {
      success: true,
      simulated: true,
      messageId: `sim-${Date.now()}-${data.referenceNumber}`,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [data.contactEmail],
        subject,
        html,
        text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      console.warn(
        `[EmailService] Resend API error (${res.status}): ${errorBody} for ${data.referenceNumber}`
      );
      return {
        success: false,
        error: `Resend HTTP ${res.status}: ${errorBody.slice(0, 200)}`,
      };
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string };
    console.info(
      `[EmailService] Confirmation email sent successfully to ${data.contactEmail} (Message ID: ${json.id || "ok"})`
    );

    return {
      success: true,
      messageId: json.id,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[EmailService] Failed to send email to ${data.contactEmail}: ${errorMsg}`
    );
    return {
      success: false,
      error: errorMsg,
    };
  }
}
