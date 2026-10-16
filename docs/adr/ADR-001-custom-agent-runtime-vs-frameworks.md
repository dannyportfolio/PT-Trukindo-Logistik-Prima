# ADR-001: Custom TypeScript State Machine Runtime vs. Heavy Agent Frameworks

**Status:** Accepted  
**Deciders:** Staff Software Engineer, Agentic AI Architect  
**Date:** 2026-10-12  

---

## Context

Dalam merancang AstraOps sebagai platform AI Sales & Lead Generation Agent, tim mempertimbangkan penggunaan framework agent populer seperti **LangChain / LangGraph**, **CrewAI**, atau **AutoGen**. Framework-framework tersebut menawarkan abstraksi tingkat tinggi untuk multi-agent orchestration, memory, dan tool calling.

Namun, sistem produksi AstraOps memiliki batasan teknis ketat:
1. **End-to-End TypeScript:** Seluruh stack backend berjalan di Node.js / TypeScript. CrewAI dan AutoGen berbasis Python, sehingga memerlukan arsitektur microservices terpisah yang menambah kompleksitas operasional.
2. **Determinisme & Auditabilitas:** Transisi status prospek, checkpointing eksekusi, bounded limits, dan proses persetujuan manusia (*Human-in-the-Loop*) harus transparan dan dapat dilacak per langkah secara langsung di basis data PostgreSQL.
3. **No-Bloat Policy:** Instruksi arsitektur melarang penambahan dependensi atau infrastruktur baru tanpa justifikasi teknis yang solid.

---

## Decision

Kami memutuskan untuk **tidak menggunakan framework agent pihak ketiga (LangChain, LangGraph, CrewAI, AutoGen)**, dan memilih membangun **Custom Deterministic Finite State Machine (FSM) Runtime di TypeScript murni** dengan validasi kontrak **Zod** dan persistence berbasis **PostgreSQL/Supabase**.

Karakteristik arsitektur runtime kustom ini:
1. **State Machine Eksplisit:** State didefinisikan sebagai union string literal TypeScript (`INGESTED`, `RESEARCHING`, `RESEARCH_COMPLETED`, `SCORING`, `AWAITING_APPROVAL`, `INSUFFICIENT_EVIDENCE`, `QUALIFIED`, `DISQUALIFIED`, `DRAFTING_PROPOSAL`, `APPROVED`, `REJECTED`, `DISPATCHING_N8N`, `COMPLETED`, `FAILED`). Transisi diatur oleh tabel transisi yang divalidasi saat kompilasi dan runtime.
2. **Zod Schema-First Tools:** Setiap tool agent memiliki kontrak input dan output yang divalidasi dengan Zod sebelum dan sesudah eksekusi.
3. **PostgreSQL Checkpointing:** Setiap mutasi state dan log eksekusi tool dicatat dalam satu transaksi ACID ke tabel `agent_runs` dan `agent_steps`.
4. **Native Resilience & Bounding:** Pembatasan step limit (maks 10 pada M2), global timeout (120 detik), budget cost ceiling ($0.50) dengan model allowlist, batas output-token, dan penegakan fail-closed, serta retry berjenjang dikelola langsung oleh runner loop tanpa black-box abstractions.

---

## Alternatives Considered

### Opsi A: LangGraph (TypeScript)
- *Kelebihan:* Mendukung state graph dan human-in-the-loop natively di JS/TS ecosystem.
- *Kekurangan:* Ekosistem dependensi berat, abstraksi memori dan callback yang sering berubah antardeprecations, serta kontrol serialisasi state database yang tidak sesederhana SQL murni.

### Opsi B: CrewAI / AutoGen (Python)
- *Kelebihan:* Populer untuk konsep role-playing multi-agent.
- *Kekurangan:* Mengharuskan backend split (Python runtime + Next.js frontend), meningkatkan latency inter-service, menyulitkan tipe TypeScript end-to-end, dan sifatnya yang non-deterministik sulit diaudit untuk proses penjualan B2B.

### Opsi C: Custom TypeScript FSM Engine (Terpilih)
- *Kelebihan:* Dependensi nol (hanya Zod + OpenAI SDK/9Router client), kontrol penuh terhadap recovery proses crash, integrasi native dengan Next.js App Router, deterministik, dan footprint memori minimal.
- *Kekurangan:* Tim harus menulis sendiri logika runner loop dan retry handler (yang sebenarnya hanya sekitar 300–400 baris kode bersih).

---

## Consequences

### Positif:
- **Zero Framework Lock-in:** Tidak ada risiko pembaruan breaking dari pustaka eksternal yang merusak alur state.
- **Transparansi State:** Setiap status lead dan agent run selalu tersinkronisasi 1:1 dengan kolom di PostgreSQL.
- **Kemudahan Debugging:** Stack trace bersih tanpa berlapis-lapis callback framework.
- **Ketahanan Crash:** Jika Node.js worker mati di tengah proses, runner dapat me-resume tepat dari step terakhir yang tersimpan di PostgreSQL.

### Negatif:
- Tim bertanggung jawab memelihara FSM engine kustom.
- Pengujian unit dan integrasi untuk state machine harus dibangun secara komprehensif oleh tim internal.
