/**
 * PT Trukindo Logistik Prima — Internal Commercial Sales Alert Dispatcher
 * Dispatches real-time alerts to WhatsApp Business API / Slack / Teams / Webhooks
 * when new quotation requests arrive.
 * 
 * Features:
 * - High-value lead highlighting (FTL > 15 Ton or dedicated regular contracts)
 * - Non-blocking fail-safe design: never crashes the caller or aborts inquiry persistence
 * - Bounded network timeout (5s)
 */

import { InquiryConfirmationData } from "../email-templates/inquiry-confirmation";
import { getConfig } from "../config";

export interface SalesAlertInquiry extends InquiryConfirmationData {
  jobTitle?: string;
}

export interface SalesAlertResult {
  dispatched: boolean;
  isHighValue: boolean;
  destination?: string;
  error?: string;
}

/**
 * Checks if an inquiry qualifies as high-value:
 * 1. Dedicated or recurring contracts (WEEKLY, CONTRACT_REGULAR, MONTHLY)
 * 2. Heavy FTL capacity (> 15 Ton / Tronton Wingbox / Trailers)
 */
export function isHighValueInquiry(inquiry: SalesAlertInquiry): boolean {
  // 1. Check Frequency
  if (
    inquiry.estimatedShippingFrequency === "CONTRACT_REGULAR" ||
    inquiry.estimatedShippingFrequency === "WEEKLY" ||
    inquiry.estimatedShippingFrequency === "MONTHLY"
  ) {
    return true;
  }

  // 2. Check Truck Category
  if (
    inquiry.truckType === "TRONTON_WINGBOX" ||
    inquiry.truckType === "TRAILER_20FT" ||
    inquiry.truckType === "TRAILER_40FT"
  ) {
    return true;
  }

  // 3. Check Textual Weight/Volume (> 15 Ton)
  if (inquiry.estimatedVolumeWeight) {
    const text = inquiry.estimatedVolumeWeight.toLowerCase();
    const tonMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:ton|t\b)/i);
    if (tonMatch) {
      const parsed = parseFloat(tonMatch[1].replace(",", "."));
      if (parsed >= 15) return true;
    }
  }

  return false;
}

/**
 * Builds formatted message payload suitable for WhatsApp, Slack, Telegram, or Discord webhooks.
 */
export function buildSalesAlertMessage(inquiry: SalesAlertInquiry): {
  text: string;
  isHighValue: boolean;
  structured: Record<string, unknown>;
} {
  const highValue = isHighValueInquiry(inquiry);
  const priorityBadge = highValue
    ? "⭐ *[PRIORITAS TINGGI / HIGH VALUE LEAD]*"
    : "ℹ️ *[INKUIRI MASUK STANDAR]*";

  const message = [
    `🚨 *INKUIRI PENAWARAN BARU: ${inquiry.referenceNumber}*`,
    priorityBadge,
    "",
    `🏢 *Perusahaan:* ${inquiry.companyName}`,
    `👤 *Kontak PIC:* ${inquiry.contactName}${inquiry.jobTitle ? ` (${inquiry.jobTitle})` : ""}`,
    `📧 *Email:* ${inquiry.contactEmail}`,
    `📞 *Telepon/WA:* ${inquiry.contactPhone}`,
    "",
    `🚚 *Rute:* ${inquiry.originCity} ➔ ${inquiry.destinationCity}`,
    `📦 *Kargo:* ${inquiry.cargoType}`,
    `🚛 *Armada:* ${inquiry.truckType || "Rekomendasi Trukindo"}`,
    `⚖️ *Estimasi Tonase:* ${inquiry.estimatedVolumeWeight || "Belum ditentukan"}`,
    `🔄 *Frekuensi:* ${inquiry.estimatedShippingFrequency || "ONE_TIME"}`,
    inquiry.firstLoadingDate ? `📅 *Jadwal Muat:* ${inquiry.firstLoadingDate}` : "",
    inquiry.additionalNotes ? `📝 *Catatan:* ${inquiry.additionalNotes}` : "",
    "",
    `⏱️ *SLA Respon:* Hubungi klien dalam 1-2 jam kerja.`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text: message,
    isHighValue: highValue,
    structured: {
      referenceNumber: inquiry.referenceNumber,
      companyName: inquiry.companyName,
      contactName: inquiry.contactName,
      contactEmail: inquiry.contactEmail,
      contactPhone: inquiry.contactPhone,
      route: `${inquiry.originCity} -> ${inquiry.destinationCity}`,
      cargoType: inquiry.cargoType,
      truckType: inquiry.truckType,
      isHighValue: highValue,
    },
  };
}

/**
 * Non-blocking dispatcher for internal commercial sales alerts.
 * Catches all exceptions so the inbound quotation ingestion always succeeds.
 */
export async function dispatchSalesAlert(
  inquiry: SalesAlertInquiry,
  customWebhookUrl?: string
): Promise<SalesAlertResult> {
  const highValue = isHighValueInquiry(inquiry);
  let webhookUrl = customWebhookUrl;

  if (!webhookUrl) {
    try {
      const config = getConfig();
      webhookUrl = config.SALES_ALERT_WEBHOOK_URL;
    } catch {
      webhookUrl = process.env.SALES_ALERT_WEBHOOK_URL;
    }
  }

  if (!webhookUrl) {
    console.info(
      `[SalesAlert] Alert skipped for ${inquiry.referenceNumber} (No SALES_ALERT_WEBHOOK_URL configured). High-Value: ${highValue}`
    );
    return {
      dispatched: false,
      isHighValue: highValue,
    };
  }

  const { text, structured } = buildSalesAlertMessage(inquiry);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const payload = {
      text,
      // Generic Slack/Discord/Teams compatibility
      content: text,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text,
          },
        },
      ],
      data: structured,
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(
        `[SalesAlert] Webhook returned HTTP ${res.status} for inquiry ${inquiry.referenceNumber}`
      );
      return {
        dispatched: false,
        isHighValue: highValue,
        destination: webhookUrl,
        error: `HTTP ${res.status}`,
      };
    }

    console.info(
      `[SalesAlert] Successfully delivered alert for ${inquiry.referenceNumber} to webhook (High-Value: ${highValue})`
    );
    return {
      dispatched: true,
      isHighValue: highValue,
      destination: webhookUrl,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[SalesAlert] Failed to dispatch sales alert for ${inquiry.referenceNumber}: ${errorMsg}`
    );
    return {
      dispatched: false,
      isHighValue: highValue,
      destination: webhookUrl,
      error: errorMsg,
    };
  }
}
