# ADR-003: n8n Architectural Boundary & Signed Webhook Protocol

**Status:** Accepted  
**Deciders:** Staff Software Engineer, Agentic AI Architect  
**Date:** 2026-10-12  

---

## Context

Dalam siklus sales outbound AstraOps, tindakan eksternal seperti pengiriman email penawaran (via SendGrid, Resend, atau Gmail), sinkronisasi kontak ke CRM (HubSpot, Pipedrive), dan pengiriman notifikasi tim (Slack) perlu diorkestrasi.

Platform orkestrasi alur kerja seperti **n8n** sangat efektif untuk mengelola konektor eksternal tersebut. Namun, terdapat risiko arsitektural jika logika bisnis (*business logic*), evaluasi kualifikasi lead, dan manajemen status diizinkan merembes (*bleed*) ke dalam skrip node n8n. Hal tersebut dapat menyebabkan logika ganda (*split-brain architecture*), data desynchronization, dan hilangnya kendali audit di repository.

---

## Decision

Kami memutuskan bahwa:
1. **Backend AstraOps adalah satu-satunya Source of Truth (Sumber Kebenaran Tunggal):**
   - Seluruh *business logic*, riset, kalkulasi skor ICP, drafting penawaran, penegakan persetujuan manusia (*Human Approval*), dan transisi state machine diputuskan dan disimpan di backend AstraOps.
   - n8n dilarang keras mengubah status kualifikasi prospek atau membuat keputusan logis independen.
2. **n8n Berperan Eksklusif sebagai Integration Dispatcher:**
   - n8n hanya menerima payload terstruktur yang telah disetujui (*Approved Proposal Payload*), mengeksekusi integrasi third-party (misal: panggil API SendGrid), lalu melaporkan kembali status pengiriman ke AstraOps.
3. **Protokol Webhook Dua Arah Terotentikasi & Bertanda Tangan (HMAC-SHA256):**

### A. Outbound Contract (AstraOps -> n8n):
- **Endpoint:** `POST https://n8n.internal.astraops/webhook/outreach-dispatch`
- **Security Headers:**
  - `X-AstraOps-Signature: sha256=<HMAC_HEX_OF_BODY>`
  - `X-AstraOps-Timestamp: <UNIX_SECONDS>`
  - `X-AstraOps-Idempotency-Key: <DISPATCH_UUID>`
- **Payload Schema:**
  ```json
  {
    "dispatchId": "uuid",
    "leadId": "uuid",
    "runId": "uuid",
    "recipient": {
      "name": "Jane Doe",
      "email": "jane@acmecorp.com",
      "company": "Acme Corp"
    },
    "message": {
      "subject": "Optimizing Acme's Cloud Observability",
      "body": "Hi Jane, noticed your recent migration to..."
    },
    "operatorApproval": {
      "approvedBy": "operator_uuid",
      "approvedAt": "2026-10-12T10:00:00Z",
      "auditLogId": "audit_uuid"
    }
  }
  ```
- **Respon n8n:** Harus mengembalikan `202 Accepted` dengan `{ "executionId": "n8n_exec_..." }`.

### B. Inbound Callback Contract (n8n -> AstraOps):
- **Endpoint:** `POST https://app.astraops.com/api/webhooks/n8n-callback`
- **Security Headers:**
  - `X-N8N-Signature: sha256=<HMAC_HEX_OF_BODY>`
  - `X-N8N-Timestamp: <UNIX_SECONDS>`
- **Payload Schema:**
  ```json
  {
    "dispatchId": "uuid",
    "executionId": "string",
    "status": "DELIVERED" | "BOUNCED" | "FAILED",
    "externalMessageId": "string",
    "errorMessage": "string | null",
    "completedAt": "ISO8601"
  }
  ```
- **Validasi AstraOps:**
  1. Validasi signature dengan `N8N_WEBHOOK_SECRET`.
  2. Periksa replay window (reject jika timestamp lebih tua dari 300 detik).
  3. Cek idempotency: Jangan memproses ulang `dispatchId` yang sudah berstatus `COMPLETED`.
  4. Perbarui state machine run menjadi `COMPLETED` dan lead status menjadi `OUTREACH_ACTIVE`.

---

## Consequences

### Positif:
- **Clean Architecture Boundaries:** Perubahan pada provider email atau CRM di n8n tidak mempengaruhi kode inti AstraOps.
- **Auditabilitas Lengkap:** Tidak ada email yang dapat dikirim dari n8n tanpa menyertakan metadata `operatorApproval` valid yang tercatat di database AstraOps.
- **Ketahanan Jaringan:** Protokol callback asinkron memastikan sistem tahan terhadap keterlambatan respon email provider pihak ketiga.

### Negatif:
- Memerlukan konfigurasi shared secret HMAC di kedua sisi (AstraOps environment variables dan n8n credential vault).
- Memerlukan penanganan kegagalan jika n8n tidak pernah mengirimkan callback (dikelola oleh timeout cron di AstraOps).
