import { test, expect } from "@playwright/test";

test.describe("True Browser End-to-End Automation Flow", () => {
  test("Complete lifecycle: Login, Lead Creation, Directory, Detail, CSV Upload, Error States, Logout, and Post-Logout boundary", async ({
    page,
  }) => {
    // -------------------------------------------------------------
    // Step 1: Initial Unauthenticated State
    // -------------------------------------------------------------
    await page.goto("/leads");
    await page.waitForLoadState("networkidle");

    // Verify initial unauthenticated banner/indicator
    const authIndicator = page.locator("header").getByText("Unauthenticated");
    await expect(authIndicator).toBeVisible();

    // -------------------------------------------------------------
    // Step 2: Login Flow & Error States
    // -------------------------------------------------------------
    // Open authentication modal
    const authBtn = page.getByRole("button", { name: "Authenticate" });
    await authBtn.click();
    await expect(page.getByText("Operator Authentication")).toBeVisible();

    // Test invalid token error state
    const tokenInput = page.locator("#operator-token");
    await tokenInput.fill("invalid-token-xyz-999");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Expect error alert
    await expect(page.getByText("Invalid authentication token")).toBeVisible();

    // Now enter valid operator token
    await tokenInput.fill("astraops-secret-token");
    await page.getByRole("button", { name: "Sign In" }).click();

    // Verify authenticated user identity in navbar
    await expect(page.locator("header").getByText("SALES_OPERATOR")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("header").getByText("Sign Out")).toBeVisible();

    // -------------------------------------------------------------
    // Step 3: Manual Lead Creation & Form Error States
    // -------------------------------------------------------------
    const addLeadBtn = page.getByRole("button", { name: "+ Add Lead" });
    await addLeadBtn.click();
    await expect(page.getByText("Manual Lead Intake")).toBeVisible();

    // Try submitting empty form to trigger validation errors
    await page.getByRole("button", { name: "Submit Lead" }).click();
    await expect(page.locator("#companyName-error")).toBeVisible();

    // Fill valid lead data
    const timestamp = Date.now();
    const testCompany = `Playwright E2E Corp ${timestamp}`;
    const testEmail = `operator_${timestamp}@playwright-test.com`;

    await page.locator("#companyName").fill(testCompany);
    await page.locator("#websiteUrl").fill("https://playwright-test.com");
    await page.locator("#contactName").fill("E2E Test Operator");
    await page.locator("#contactEmail").fill(testEmail);

    await page.getByRole("button", { name: "Submit Lead" }).click();

    // Verify modal closes and lead appears in table
    await expect(page.getByText("Manual Lead Intake")).not.toBeVisible({ timeout: 8000 });
    const tableCell = page.getByRole("cell", { name: testCompany });
    await expect(tableCell).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------
    // Step 4: Leads Directory & Navigation to Lead Detail
    // -------------------------------------------------------------
    const leadRow = page.locator("tr", { hasText: testCompany });
    await expect(leadRow).toBeVisible();
    await expect(leadRow.getByText("INGESTED")).toBeVisible();

    // Click "View Detail →" for the newly created lead
    await leadRow.getByRole("link", { name: /View Detail/i }).click();

    // -------------------------------------------------------------
    // Step 5: Lead Detail Page & Append-Only Audit Trail
    // -------------------------------------------------------------
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: testCompany })).toBeVisible();
    await expect(page.getByRole("link", { name: "https://playwright-test.com ↗" })).toBeVisible();
    await expect(page.getByRole("link", { name: testEmail })).toBeVisible();

    // Verify immutable audit trail record
    await expect(page.locator(".card").getByText("LEAD_INGESTED")).toBeVisible();
    await expect(page.locator(".card").getByText("service_operator").first()).toBeVisible();

    // Navigate back to directory
    await page.getByRole("link", { name: "← Back to Leads Directory" }).click();
    await expect(page).toHaveURL("/leads");

    // -------------------------------------------------------------
    // Step 6: CSV Upload & File Error States
    // -------------------------------------------------------------
    const uploadCsvBtn = page.getByRole("button", { name: "Upload CSV" });
    await uploadCsvBtn.click();
    await expect(page.getByText("Bulk CSV Lead Intake")).toBeVisible();

    // Upload a valid CSV batch
    const csvContent = [
      "Company Name,Website URL,Contact Name,Contact Email",
      `Playwright CSV 1 ${timestamp},https://csv1.com,Alice,alice_${timestamp}@playwright-test.com`,
      `Playwright CSV 2 ${timestamp},https://csv2.com,Bob,bob_${timestamp}@playwright-test.com`,
    ].join("\n");

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByText("Drag and drop your CSV file here").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "e2e_batch.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });

    // Start batch import
    await page.getByRole("button", { name: "Start Batch Import" }).click();

    // Verify toast notification and imported rows in leads table
    await expect(page.getByText(/Batch CSV import completed: 2 leads imported/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("cell", { name: `Playwright CSV 1 ${timestamp}` })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("cell", { name: `Playwright CSV 2 ${timestamp}` })).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------
    // Step 7: Logout Flow
    // -------------------------------------------------------------
    const signOutBtn = page.locator("header").getByRole("button", { name: "Sign Out" });
    await signOutBtn.click();

    // -------------------------------------------------------------
    // Step 8: Post-Logout Access & Session Boundary Enforcement
    // -------------------------------------------------------------
    await page.waitForLoadState("networkidle");
    await expect(page.locator("header").getByText("Unauthenticated")).toBeVisible();
    await expect(page.locator("header").getByRole("button", { name: "Authenticate" })).toBeVisible();

    // Ensure session cookie has been cleared
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "astraops_session");
    expect(sessionCookie?.value || "").toBe("");
  });
});
