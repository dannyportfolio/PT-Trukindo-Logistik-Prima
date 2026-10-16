import { test, expect } from "@playwright/test";

test.describe("Trukindo Public Corporate Website & Quote Request Flow", () => {
  test("Homepage renders value proposition, verified services, and quote CTA", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Semantic H1 Heading
    const h1 = page.locator("h1");
    await expect(h1).toContainText("Menghubungkan Bisnis, Menggerakkan Logistik Indonesia");

    // Core Services
    await expect(page.getByRole("heading", { name: "Full Truck Load (FTL)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scheduled Linehaul" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dedicated Contract Logistics" })).toBeVisible();

    // CTA Button
    const quoteBtn = page.getByRole("link", { name: "Minta Penawaran Muatan →" });
    await expect(quoteBtn).toBeVisible();
  });

  test("Corporate public navigation links are all functional", async ({ page }) => {
    // 1. About Us
    await page.goto("/about");
    await expect(page.locator("h1")).toContainText("Tentang PT Trukindo Logistik Prima");

    // 2. Services
    await page.goto("/services");
    await expect(page.locator("h1")).toContainText("Layanan Transportasi Darat B2B");

    // 3. Fleet & Cargo
    await page.goto("/fleet-cargo");
    await expect(page.locator("h1")).toContainText("Armada Truk & Klasifikasi Muatan");
    await expect(page.getByText("CDE (Colt Diesel Engkel)")).toBeVisible();
    await expect(page.getByText("Tronton (Box / Wingbox)")).toBeVisible();

    // 4. Industries
    await page.goto("/industries");
    await expect(page.locator("h1")).toContainText("Solusi Logistik Khusus Sektor Industri");

    // 5. Operations & Safety
    await page.goto("/operations-safety");
    await expect(page.locator("h1")).toContainText("Standar Operasional & Keselamatan Jalan");

    // 6. Contact
    await page.goto("/contact");
    await expect(page.locator("h1")).toContainText("Kontak & Layanan Komersial");
  });

  test("Three-Step Quote Request Form: step progression, validation, and summary editing", async ({
    page,
  }) => {
    await page.goto("/quote");
    await page.waitForLoadState("networkidle");

    // Verify initial clean state: starts on Step 1
    await expect(page.getByText("Langkah 1 dari 3").first()).toBeVisible();
    await expect(page.locator("#contactName")).toBeEmpty();
    await expect(page.locator("#companyName")).toBeEmpty();
    await expect(page.locator("#contactEmail")).toBeEmpty();
    await expect(page.locator("#contactPhone")).toBeEmpty();

    // Try continuing without filling required fields
    const nextBtnStep1 = page.getByRole("button", { name: "Lanjut ke Spesifikasi Muatan →" });
    await nextBtnStep1.click();

    // Verify inline field error messages
    await expect(page.getByText("Nama lengkap wajib diisi")).toBeVisible();
    await expect(page.getByText("Nama perusahaan wajib diisi")).toBeVisible();
    await expect(page.getByText("Email bisnis wajib diisi")).toBeVisible();
    await expect(page.getByText("Nomor WhatsApp/telepon wajib diisi")).toBeVisible();

    // Fill valid Step 1 data
    await page.locator("#contactName").fill("Iwan Setiawan");
    await page.locator("#companyName").fill("PT Manufaktur Maju Gemilang");
    await page.locator("#contactEmail").fill("iwan.setiawan@majumakmur.co.id");
    await page.locator("#contactPhone").fill("+6281399887766");
    await page.locator("#jobTitle").fill("Procurement & Logistics Manager");

    // Proceed to Step 2
    await nextBtnStep1.click();
    await expect(page.getByText("Langkah 2 dari 3").first()).toBeVisible();

    // Select service card
    await page.getByText("Scheduled Linehaul").first().click();

    // Select cargo category
    await page.getByText("Barang Jadi / Manufaktur").click();

    // Fill routes
    await page.locator("#originCity").fill("Kawasan Industri GIIC Cikarang");
    await page.locator("#destinationCity").fill("Rungkut Industri Surabaya");

    // Fill frequency and volume
    await page.locator("#estimatedVolumeWeight").fill("20 Ton / 45 CBM");

    // Proceed to Step 3 (Summary)
    const nextBtnStep2 = page.getByRole("button", { name: "Lanjut ke Ringkasan & Konfirmasi →" });
    await nextBtnStep2.click();
    await expect(page.getByText("Langkah 3 dari 3").first()).toBeVisible();

    // Verify summary reflects entered inputs
    await expect(page.getByText("Iwan Setiawan").first()).toBeVisible();
    await expect(page.getByText("PT Manufaktur Maju Gemilang").first()).toBeVisible();
    await expect(page.getByText("iwan.setiawan@majumakmur.co.id")).toBeVisible();
    await expect(page.getByText("Kawasan Industri GIIC Cikarang → Rungkut Industri Surabaya").first()).toBeVisible();

    // Verify Disclaimers are present
    await expect(
      page.getByText("Pernyataan Integritas Komersial").first()
    ).toBeVisible();
    await expect(
      page.getByText("Penawaran dan tarif resmi menunggu konfirmasi")
    ).toBeVisible();

    // Test back/edit navigation: Click "Ubah" on Contact block
    const editContactBtn = page.getByRole("button", { name: "Ubah" }).first();
    await editContactBtn.click();

    // Should navigate back to Step 1 while preserving inputs
    await expect(page.getByText("Langkah 1 dari 3").first()).toBeVisible();
    await expect(page.locator("#contactName")).toHaveValue("Iwan Setiawan");
    await expect(page.locator("#companyName")).toHaveValue("PT Manufaktur Maju Gemilang");
  });

  test("Mobile responsive layout: no horizontal scroll on 320px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/quote");
    await page.waitForLoadState("networkidle");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

    // Scroll width should not exceed client width (zero unwanted horizontal overflow)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("Interactive UX 2.0: Preset pills, live completeness gauge, and summary group navigation", async ({
    page,
  }) => {
    await page.goto("/quote");
    await page.waitForLoadState("networkidle");

    // Fill Step 1
    await page.locator("#contactName").fill("Dewi Lestari");
    await page.locator("#companyName").fill("PT Logistik Nusantara Abadi");
    await page.locator("#contactEmail").fill("dewi@nusantara-abadi.com");
    await page.locator("#contactPhone").fill("+6281122334455");

    // Verify summary reflects contact in real time
    await expect(page.getByText("PT Logistik Nusantara Abadi").first()).toBeVisible();
    await expect(page.getByText("Dewi Lestari").first()).toBeVisible();

    // Proceed to Step 2
    await page.getByRole("button", { name: "Lanjut ke Spesifikasi Muatan →" }).click();
    await expect(page.getByText("Langkah 2 dari 3").first()).toBeVisible();

    // Test Quick Route Preset Pill
    const routePresetBtn = page.getByRole("button", { name: "Jabodetabek → Surabaya" });
    await routePresetBtn.click();
    await expect(page.locator("#originCity")).toHaveValue("Kawasan Industri GIIC Cikarang");
    await expect(page.locator("#destinationCity")).toHaveValue("Rungkut Industri Surabaya");

    // Test Payload Capacity Preset Pill
    const payloadPresetBtn = page.getByRole("button", { name: "8-10 Ton (Fuso)" });
    await payloadPresetBtn.click();
    await expect(page.locator("#estimatedVolumeWeight")).toHaveValue("8 - 10 Ton (~35 CBM)");

    // Verify summary live completeness meter reflects 100% when core parameters are filled
    await expect(page.getByText("7 dari 7 (100%)").first()).toBeVisible();

    // Proceed to Step 3
    await page.getByRole("button", { name: "Lanjut ke Ringkasan & Konfirmasi →" }).click();
    await expect(page.getByText("Langkah 3 dari 3").first()).toBeVisible();

    // Test sidebar "Ubah Rute" group edit button jumps directly to Step 2
    const editRouteBtn = page.getByRole("button", { name: "Ubah Rute" }).first();
    await editRouteBtn.click();
    await expect(page.getByText("Langkah 2 dari 3").first()).toBeVisible();
    await expect(page.locator("#originCity")).toBeFocused();
  });

  test("Mobile quotation experience: collapsible summary accordion opens and closes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/quote");
    await page.waitForLoadState("networkidle");

    // Mobile summary toggle bar should be visible on mobile viewport
    const summaryToggle = page.locator(".mobile-summary-toggle button");
    await expect(summaryToggle).toBeVisible();
    await expect(summaryToggle).toContainText("Buka ▼");

    // Expand mobile summary
    await summaryToggle.click();
    await expect(summaryToggle).toContainText("Tutup ▲");
    const guidancePanel = page.locator(".quote-guidance-panel");
    await expect(guidancePanel).toHaveClass(/mobile-open/);

    // Collapse mobile summary
    await summaryToggle.click();
    await expect(summaryToggle).toContainText("Buka ▼");
  });
});

