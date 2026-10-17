import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  renderInquiryConfirmationHtml,
  renderInquiryConfirmationText,
  InquiryConfirmationData,
} from "@/lib/email-templates/inquiry-confirmation";
import {
  isHighValueInquiry,
  buildSalesAlertMessage,
  dispatchSalesAlert,
  SalesAlertInquiry,
} from "@/lib/notifications/sales-alert";
import { sendInquiryConfirmationEmail } from "@/lib/notifications/email-service";

describe("Milestone 2 Issue #2: Transactional Email & Internal Sales Alert Suite", () => {
  const sampleInquiry: SalesAlertInquiry = {
    referenceNumber: "TRK-A1B2C3D4",
    companyName: "PT Mayora Indah Tbk",
    contactName: "Budi Pratama",
    contactEmail: "budi.pratama@mayora.co.id",
    contactPhone: "+6281234567890",
    jobTitle: "Logistics Manager",
    originCity: "Tangerang",
    destinationCity: "Surabaya",
    serviceCategory: "FTL_TRUCKING",
    cargoType: "FMCG_CONSUMER_GOODS",
    truckType: "TRONTON_WINGBOX",
    estimatedVolumeWeight: "18 Ton / 50 CBM",
    estimatedShippingFrequency: "WEEKLY",
    firstLoadingDate: "2026-11-01",
    additionalNotes: "Muatan palet biskuit kering, membutuhkan armada berterpal rapat.",
    submittedAt: "2026-10-17T12:00:00Z",
  };

  describe("1. Email Template Rendering (HTML & Text)", () => {
    it("should render corporate HTML email conforming to Trukindo Blue & White design", () => {
      const html = renderInquiryConfirmationHtml(sampleInquiry);

      expect(html).toContain("PT TRUKINDO LOGISTIK PRIMA");
      expect(html).toContain("TRK-A1B2C3D4");
      expect(html).toContain("Budi Pratama");
      expect(html).toContain("PT Mayora Indah Tbk");
      expect(html).toContain("Tangerang");
      expect(html).toContain("Surabaya");
      expect(html).toContain("Tronton Wingbox");
      expect(html).toContain("18 Ton / 50 CBM");
      expect(html).toContain("1 - 2 Jam Kerja");
      // Colors from Trukindo Blue & White Design System
      expect(html).toContain("#0B2D52");
      expect(html).toContain("#1D5FA7");
      expect(html).toContain("#F7FAFE");
    });

    it("should escape malicious characters in HTML email to prevent injection", () => {
      const maliciousInquiry: InquiryConfirmationData = {
        ...sampleInquiry,
        companyName: '<script>alert("xss")</script>',
        contactName: '"><img src=x onerror=alert(1)>',
      };

      const html = renderInquiryConfirmationHtml(maliciousInquiry);
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
    });

    it("should render plain text fallback email with essential logistics specs", () => {
      const text = renderInquiryConfirmationText(sampleInquiry);

      expect(text).toContain("PT TRUKINDO LOGISTIK PRIMA");
      expect(text).toContain("TRK-A1B2C3D4");
      expect(text).toContain("Tangerang ➔ Surabaya");
      expect(text).toContain("18 Ton / 50 CBM");
      expect(text).toContain("SLA PENINJAUAN KOMERSIAL: 1 - 2 Jam Kerja");
    });
  });

  describe("2. High-Value Inquiry Detection & Sales Alert Logic", () => {
    it("should classify FTL with > 15 Ton as high-value lead", () => {
      const highWeight: SalesAlertInquiry = {
        ...sampleInquiry,
        estimatedShippingFrequency: "ONE_TIME",
        truckType: "FUSO",
        estimatedVolumeWeight: "16 Ton",
      };
      expect(isHighValueInquiry(highWeight)).toBe(true);
    });

    it("should classify Tronton Wingbox and Trailers as high-value lead", () => {
      const wingbox: SalesAlertInquiry = {
        ...sampleInquiry,
        estimatedShippingFrequency: "ONE_TIME",
        truckType: "TRONTON_WINGBOX",
        estimatedVolumeWeight: "10 Ton",
      };
      expect(isHighValueInquiry(wingbox)).toBe(true);
    });

    it("should classify regular dedicated contract frequency (WEEKLY, CONTRACT_REGULAR) as high-value lead", () => {
      const regularContract: SalesAlertInquiry = {
        ...sampleInquiry,
        truckType: "CDD_DOUBLE",
        estimatedVolumeWeight: "4 Ton",
        estimatedShippingFrequency: "CONTRACT_REGULAR",
      };
      expect(isHighValueInquiry(regularContract)).toBe(true);
    });

    it("should NOT classify one-time low-tonnage inquiries as high-value lead", () => {
      const standardInquiry: SalesAlertInquiry = {
        ...sampleInquiry,
        truckType: "CDE_ENGKEL",
        estimatedVolumeWeight: "2 Ton",
        estimatedShippingFrequency: "ONE_TIME",
      };
      expect(isHighValueInquiry(standardInquiry)).toBe(false);
    });

    it("should format alert message with high-value priority badge", () => {
      const { text, isHighValue } = buildSalesAlertMessage(sampleInquiry);

      expect(isHighValue).toBe(true);
      expect(text).toContain("⭐ *[PRIORITAS TINGGI / HIGH VALUE LEAD]*");
      expect(text).toContain("PT Mayora Indah Tbk");
      expect(text).toContain("Budi Pratama");
      expect(text).toContain("Tangerang ➔ Surabaya");
      expect(text).toContain("+6281234567890");
    });
  });

  describe("3. Dispatcher Resilience & Error Handling", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("dispatchSalesAlert should gracefully resolve without error when webhook is not configured", async () => {
      const result = await dispatchSalesAlert(sampleInquiry, "");
      expect(result.dispatched).toBe(false);
      expect(result.isHighValue).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("dispatchSalesAlert should POST alert payload to configured webhook", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve("ok"),
      });
      global.fetch = mockFetch;

      const result = await dispatchSalesAlert(
        sampleInquiry,
        "https://api.trukindo.co.id/webhook/test-alert"
      );

      expect(result.dispatched).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledOpts] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("https://api.trukindo.co.id/webhook/test-alert");
      expect(calledOpts.method).toBe("POST");

      const body = JSON.parse(calledOpts.body);
      expect(body.text).toContain("TRK-A1B2C3D4");
      expect(body.data.isHighValue).toBe(true);
    });

    it("dispatchSalesAlert should catch network errors and never throw (fail-safe non-blocking)", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const result = await dispatchSalesAlert(
        sampleInquiry,
        "https://api.trukindo.co.id/webhook/test-down"
      );

      expect(result.dispatched).toBe(false);
      expect(result.error).toContain("Connection refused");
    });

    it("sendInquiryConfirmationEmail should simulate delivery safely when RESEND_API_KEY is not configured", async () => {
      const result = await sendInquiryConfirmationEmail(sampleInquiry, { apiKey: "" });

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it("sendInquiryConfirmationEmail should call Resend API when API key is provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: "resend_msg_12345" }),
      });
      global.fetch = mockFetch;

      const result = await sendInquiryConfirmationEmail(sampleInquiry, {
        apiKey: "re_test_key_12345",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("resend_msg_12345");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [calledUrl, calledOpts] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("https://api.resend.com/emails");
      expect(calledOpts.headers.Authorization).toBe("Bearer re_test_key_12345");
    });
  });
});
