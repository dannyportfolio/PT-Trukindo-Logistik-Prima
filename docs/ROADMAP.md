# ENGINEERING ROADMAP — PHASES & MILESTONES
## PT Trukindo Logistik Prima | AstraOps Platform

Dokumen roadmap ini menetapkan tahapan pengembangan (*Phases*), tonggak capaian (*Milestones*), dan alokasi tugas tim engineering untuk peluncuran dan ekspansi platform komersial logistik PT Trukindo Logistik Prima.

---

## 🗺️ IKHTISAR ROADMAP & MILESTONES GITHUB

| Phase / Milestone | Target Tanggal | Fokus Utama | Issue Terkait | Status |
| :--- | :---: | :--- | :--- | :---: |
| **[Phase 1: Production Foundation & Live Deployment](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/milestone/1)** | Nov 2026 | Deployment VPS Container, Custom Domain, HTTPS Caddy, Managed PostgreSQL | [#1](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/1), [#3](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/3) | 🟡 In Progress |
| **[Phase 2: Commercial Intake & Communication Automation](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/milestone/2)** | Nov 2026 | Notifikasi Email & WhatsApp inkuiri masuk, Upgrade Login RBAC & MFA | [#2](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/2), [#4](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/4) | ⚪ Planned |
| **[Phase 3: AI Intelligence Engine & ICP Prospecting](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/milestone/3)** | Des 2026 | Model Gateway 9Router / OpenAI Fallback, Sandboxed Web Scraper, ICP Scoring | [#5](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/5) | ⚪ Planned |
| **[Phase 4: Fleet Telematics & Real-Time Client Tracking](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/milestone/4)** | Jan 2027 | Portal publik cek resi / waybill (`/track`), Webhook API GPS armada | [#6](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/6) | ⚪ Planned |

---

## 📋 RINCIAN SETIAP FASE

### 🚀 Phase 1: Production Foundation & Live Deployment
**Fokus Tim:** DevOps Engineer & Database Administrator  
**Tujuan:** Memastikan aplikasi berjalan stabil di lingkungan produksi dengan domain resmi korporat dan basis data terkelola yang aman.

- **Issue #1 — [[DevOps] Setup Production Container Hosting & Reverse Proxy SSL (Let's Encrypt)](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/1):**
  - Provisioning VPS Linux Ubuntu (2 vCPU, 4GB RAM, Docker Engine).
  - Setup Caddy Reverse Proxy untuk otomatisasi SSL HTTPS Let's Encrypt.
  - Setup DNS A-Record pada domain target (`logistikprima.com` atau `logistikprima.dannyportfolio.com`).
  - Deploy via `docker compose up -d --build` sesuai panduan [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md).
- **Issue #3 — [[Database] Setup Managed PostgreSQL, Automated Backup & Connection Pool Tuning](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/3):**
  - Provisioning Managed PostgreSQL 16 (Supabase / Neon / Cloud RDS) dengan SSL aktif.
  - Eksekusi migrasi skema melalui runner mandiri: `npm run db:migrate`.
  - Konfigurasi backup harian otomatis (*automated snapshots*) dengan retensi 30 hari.

---

### 📩 Phase 2: Commercial Intake & Communication Automation
**Fokus Tim:** Full-Stack Engineer & Backend Specialist  
**Tujuan:** Menghubungkan calon pengirim langsung dengan tim penjualan melalui notifikasi instan serta mengamankan portal internal AstraOps.

- **Issue #2 — [[Feature] Integrasi Notifikasi Email Transaksional & Alert WhatsApp untuk Inkuiri Masuk](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/2):**
  - Integrasi Resend / SendGrid untuk email tanda terima inkuiri otomatis berkode referensi `TRK-XXXXXXXX`.
  - Alert webhook real-time ke grup WhatsApp Sales / Slack saat ada inkuiri FTL muatan besar.
- **Issue #4 — [[Security] Upgrade Autentikasi Internal Desk dari Static Token ke OIDC / Session RBAC & MFA](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/4):**
  - Tabel database `users` dengan hashing Argon2id/Bcrypt.
  - Otentikasi dua faktor (TOTP Google Authenticator) untuk Sales Operator dan Admin.
  - Pencatatan UUID operator asli pada setiap review dan approval di `audit_logs`.

---

### 🤖 Phase 3: AI Intelligence Engine & ICP Prospecting
**Fokus Tim:** AI/ML Engineer & Backend Engineer  
**Tujuan:** Mengaktifkan kapabilitas otomatisasi intelijen prospek B2B dan estimasi rute cerdas.

- **Issue #5 — [[AI Engine] Verifikasi Produksi 9Router Gateway & Model Inference Fallback](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/5):**
  - Konfigurasi 9Router Gateway lokal (`:20128/v1`) dengan kompresi token RTK.
  - Dual-adapter fallback mulus ke direct OpenAI SDK jika gateway mengalami gangguan.
  - Validasi akurasi rubrik ICP kargo logistik terhadap *35 Golden Dataset*.
  - Penegakan batas anggaran biaya token (< $0.25 USD per lead) dan proteksi *Prompt Injection*.

---

### 🚛 Phase 4: Fleet Telematics & Real-Time Client Tracking
**Fokus Tim:** Frontend Engineer & IoT/Telematics Integrator  
**Tujuan:** Memberikan transparansi visibilitas penuh pergerakan kargo armada kepada klien B2B.

- **Issue #6 — [[Feature] Portal Pelacakan Pengiriman (Waybill / Resi B/L) & Integrasi GPS Telematika Armada](https://github.com/dannyportfolio/PT-Trukindo-Logistik-Prima/issues/6):**
  - Halaman publik pelacakan kargo (`/track`) berbasis nomor Surat Jalan / B/L.
  - Webhook ingestion posisi geospasial dari provider GPS armada (McEasy / EasyGo).
  - Monitoring checkpoint rute antarkota (Pantura, Trans-Jawa, Penyeberangan Ferry Ketapang/Bakauheni).
