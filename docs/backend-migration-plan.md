# Backend Migration Plan: Next.js → Laravel

## Strategi Migrasi

**Prinsip:** Jalankan Next.js dan Laravel secara berdampingan. Pindahkan modul satu per satu. Frontend tetap di Next.js, tapi API calls gradually dipointing ke Laravel.

```
Phase 1-3:  Next.js ──┬── API routes (lead, dll)
                       │
              Laravel ──┘ (belum dipakai)

Phase 4-6:  Next.js ──┬── API routes (baru)
                       │
              Laravel ──┴── APIs (migrasi bertahap)

Phase 7+:   Next.js ────── Laravel API (full)
```

---

## Phase 1: Setup Laravel & Auth (Estimasi: 2-3 hari)

### Tujuan
Fondasi Laravel berjalan, auth compatible dengan sistem yang ada.

### Tasks
1. **Setup project Laravel** di folder `backend/`
2. **Setup database** — gunakan PostgreSQL yang sama
3. **Setup Auth** — Laravel Sanctum (token-based)
4. **Setup CORS** — allow Next.js origin
5. **Environment setup**

### Verification
- [ ] Laravel berjalan di `localhost:8000`
- [ ] Login berhasil return token
- [ ] Token bisa dipakai untuk access protected endpoint
- [ ] CORS tidak error dari Next.js

---

## Phase 2: Leads CRUD (Estimasi: 2-3 hari)

### Tasks
1. Buat Model & Migration (Lead, LeadAudit)
2. Migrate schema dari `src/types/lead.ts`
3. Buat LeadController dengan endpoints CRUD
4. Buat LeadRepository
5. Update frontend pointing ke Laravel

---

## Phase 3: CSV Import & Audit Log (Estimasi: 1-2 hari)

### Tasks
1. CSV Import endpoint
2. Audit Log viewer endpoint
3. Rate limiting

---

## Phase 4: AI Agent — Core Services (Estimasi: 3-4 hari)

### Tasks
1. LLM Gateway client
2. Web Scraper (Guzzle + DOMCrawler)
3. SSRF Guard
4. Fact Extractor
5. ICP Scorer

---

## Phase 5: AI Agent — Pipeline & State Machine (Estimasi: 2-3 hari)

### Tasks
1. State Machine
2. Agent Runner (orchestrator)
3. Agent Repository
4. API Endpoints
5. Synchronous execution

---

## Phase 6: Inquiry & Quote Form (Estimasi: 1-2 hari)

### Tasks
1. Inquiry API
2. Quote reference
3. Update frontend

---

## Phase 7: Testing & Polish (Estimasi: 2-3 hari)

### Tasks
1. Integration test
2. Frontend E2E test
3. Security audit
4. Performance test
5. Documentation

---

## Ringkasan Timeline

| Phase | Modul | Estimasi |
|---|---|---|
| 1 | Laravel setup + Auth | 2-3 hari |
| 2 | Leads CRUD | 2-3 hari |
| 3 | CSV + Audit + Rate Limit | 1-2 hari |
| 4 | AI Agent Core Services | 3-4 hari |
| 5 | AI Agent Pipeline | 2-3 hari |
| 6 | Inquiry + Quote | 1-2 hari |
| 7 | Testing + Polish | 2-3 hari |
| **Total** | | **~2-3 minggu** |

---

## Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| AI agent behavior beda | Test extensively dengan mock LLM |
| LLM prompt injection porting | Copy strategy: XML quarantine, pattern detection |
| Timeout/sync issue | Laravel queue sebagai fallback |
| Data inconsistency migrasi | Dual-run period: tulis ke dua backend |
