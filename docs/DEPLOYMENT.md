# PANDUAN DEPLOYMENT & SETUP DOMAIN
## PT Trukindo Logistik Prima | AstraOps Platform

**Versi Dokumen:** 1.0.0  
**Tanggal:** Oktober 2026  
**Status Baseline:** Verified & Production Ready  

---

## 1. STATUS MATRIKS PEKERJAAN

| Komponen / Task | Status | Keterangan & Rincian |
| :--- | :--- | :--- |
| **Audit Repository & Server-Side Dependencies** | **DONE** | Terverifikasi: App Router Next.js 15, PostgreSQL direct pool, 11 API routes, in-memory rate limiter, SSRF guard, runtime agent 120s. |
| **Penyelarasan Desain Korporat Blue & White** | **DONE** | Lulus seluruh halaman publik & form: `#123B70`, `#0B2D52`, `#1D5FA7`, `#EAF3FF`, `#FFFFFF`, `#F7FAFE`. Bebas dari warna oranye lama. |
| **Konfigurasi Container & Build Standalone** | **DONE** | Multi-stage `Dockerfile`, `docker-compose.yml`, dan `next.config.ts` (`output: 'standalone'`) terverifikasi sukses build. |
| **Cross-Origin & CORS Inquiries API** | **DONE** | Endpoint `POST /api/inquiries` mendukung preflight `OPTIONS`, CORS headers dinamis, dan parameter `NEXT_PUBLIC_API_URL` pada form. |
| **Script Migrasi Mandiri Database** | **DONE** | Menambahkan `scripts/migrate.mjs` dan script `npm run db:migrate` dengan PostgreSQL advisory lock dan verifikasi checksum SHA256. |
| **CI/CD Quality Gate Workflow** | **DONE** | `.github/workflows/ci.yml` dikonfigurasi untuk validasi otomatis typecheck, ESLint, unit tests, dan production build. |
| **Template Environment Variables** | **DONE** | `.env.example` diperbarui lengkap tanpa membocorkan secret. |
| **Keamanan Git & Proteksi Secret** | **DONE** | `.gitignore` diperbarui mengabaikan `.env*`, `*.zip`, file temporary, dan build output. |
| **Operasional Database Lokal (Backup Harian, Retensi 30 Hari, DR Drill)** | **DONE** | Tersedia `npm run db:backup`, `npm run db:dr-drill` (status PASS), dan `npm run db:verify`. Runbook: `docs/DATABASE_OPERATIONS.md`. |
| **Penyediaan Managed PostgreSQL Produksi (HA, Replikasi, PITR)** | **DEFERRED** | Ditunda atas keputusan pemilik proyek — fokus tahap lokal. Roadmap & matriks provider: `docs/DATABASE_OPERATIONS.md` Bagian 9; rasional: `docs/adr/ADR-008-database-operations-backup-and-ha-strategy.md`. |
| **Penyediaan Server Runtime / Container Hosting** | **NEEDS_CONFIGURATION** | Membutuhkan pemilihan provider hosting (VPS Docker, Railway, Render, Fly.io, atau AWS/GCP) oleh pemilik proyek. |
| **Konfigurasi DNS & SSL Target Domain** | **NEEDS_CONFIGURATION** | Membutuhkan konfigurasi DNS record (A/CNAME) pada registrar domain milik pemilik proyek. |
| **Akses Langsung Domain `logistikprima.dannyportfolio.github.io`** | **BLOCKED** | Secara teknis **tidak dapat digunakan** karena batasan arsitektur DNS GitHub Pages (lihat penjelasan di Bagian 3). |

---

## 2. ARSITEKTUR DEPLOYMENT FINAL

AstraOps merupakan platform enterprise hybrid yang terdiri dari dua domain kebutuhan:
1. **Public Company Website:** Profil korporat, katalog armada FTL, spesifikasi rute Jawa–Bali–Sumatra, kepatuhan Zero ODOL, dan formulir permintaan penawaran harga 3-langkah.
2. **Internal Business Desk & Automation Engine:** Ingestion inkuiri leads, autentikasi berbasis sesi cookie HTTP-only/Bearer, database transaksional PostgreSQL, web scraper dengan proteksi SSRF, pipeline AI agent 120 detik, serta gate persetujuan manusia (*Human-in-the-Loop*).

### Pilihan Strategi Arsitektur

```
[STRATEGI A: REKOMENDASI UTAMA — UNIFIED CONTAINER FULL-STACK]

Browser Klien (Publik / SDR)
            │
            ▼ (HTTPS / Port 443 via Reverse Proxy: Caddy / Nginx / Cloudflare)
┌────────────────────────────────────────────────────────────────────────┐
│                   AstraOps Unified Container Runtime                   │
│                                                                        │
│   ┌─────────────────────────────────┐   ┌───────────────────────────┐  │
│   │     Public Website (Next.js)    │   │  Internal Business Desk   │  │
│   │   /, /quote, /fleet, /services  │   │      /leads, /leads/[id]  │  │
│   └─────────────────────────────────┘   └───────────────────────────┘  │
│                                                                        │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    Next.js Route Handlers                       │  │
│   │   /api/inquiries, /api/leads, /api/auth, /api/agent/run         │  │
│   └─────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ (Pool TCP 5432)
                                     ▼
                      ┌──────────────────────────────┐
                      │    PostgreSQL Database 16    │
                      │  (Schema, Audit, Idempotent) │
                      └──────────────────────────────┘
```

#### Mengapa Strategi A (Unified Full-Stack) Direkomendasikan?
- **Performa & Zero CORS:** Seluruh request dari form penawaran berjalan *same-origin* (`/api/inquiries`), meniadakan latensi CORS preflight.
- **Dukungan Agent Runtime:** Pipeline agent memerlukan durasi eksekusi hingga 120 detik dengan koneksi persistent. Container runtime (Docker) menjamin koneksi tidak terputus di tengah jalan (berbeda dengan serverless yang membatasi timeout pada 15–60 detik).
- **Proteksi Database:** Kredensial database PostgreSQL terisolasi penuh di sisi server dan tidak pernah terekspos ke internet publik.

---

## 3. ANALISIS TEKNIS DOMAIN TARGET & GITHUB PAGES

### Target Hostname yang Diminta:
`https://logistikprima.dannyportfolio.github.io`

### Temuan Teknis & Batasan Arsitektur:
1. **Aturan DNS GitHub Pages:**
   - GitHub Pages menyediakan dua jenis domain bawaan:
     - **User/Org Site:** `https://<username>.github.io` (contoh: `https://dannyportfolio.github.io`).
     - **Project Site:** `https://<username>.github.io/<repository-name>` (contoh: `https://dannyportfolio.github.io/logistikprima` atau `https://dannyportfolio.github.io/astraops`).
   - GitHub **tidak pernah mendukung** subdomain bersarang (*nested subdomain*) dari `github.io` seperti `<project>.<username>.github.io`. DNS wildcard nameserver GitHub hanya mengarahkan `*.github.io` satu tingkat ke akun pengguna. Oleh karena itu, hostname `logistikprima.dannyportfolio.github.io` akan selalu berstatus `NXDOMAIN` (Domain Not Found).
2. **Karakteristik Static Hosting:**
   - GitHub Pages murni berupa *static file server* (HTML, CSS, JS statis).
   - GitHub Pages **tidak menjalankan** Node.js runtime, API route handler Next.js (`/api/inquiries`, `/api/leads`), koneksi PostgreSQL, autentikasi cookie session, maupun engine AI agent.
   - Mengaktifkan `output: 'export'` pada Next.js secara paksa akan menghapus seluruh kapabilitas backend dan merusak sistem inkuiri komersial.

### Rekomendasi Solusi Domain yang Valid:
1. **Opsi 1 (Direkomendasikan — Custom Domain Mandiri):**
   Gunakan domain korporat profesional milik sendiri, misalnya:
   - `https://logistikprima.com` (Root domain korporat)
   - atau `https://trukindo.co.id`
   - atau subdomain portofolio: `https://logistikprima.dannyportfolio.com` (di mana `dannyportfolio.com` adalah domain pribadi yang dikontrol sendiri via DNS Cloudflare/Registrar).
2. **Opsi 2 (Jika Ingin Tetap Memanfaatkan GitHub Pages untuk Halaman Statis):**
   - Public Website di-host di URL GitHub Pages yang valid: `https://dannyportfolio.github.io/logistikprima/`.
   - Backend API di-host di cloud container (misalnya: `https://api-astraops.yourdomain.com`).
   - Form pada website statis dikonfigurasi mengirim ke backend remote melalui variabel environment:
     `NEXT_PUBLIC_API_URL=https://api-astraops.yourdomain.com`

---

## 4. PROVIDER & LAYANAN YANG DIBUTUHKAN

Untuk menjalankan platform AstraOps secara utuh (Strategi A):

| Kebutuhan | Provider yang Direkomendasikan | Alternatif |
| :--- | :--- | :--- |
| **Compute / Container Runtime** | VPS Ubuntu (DigitalOcean / Hetzner / Linode / AWS EC2) menggunakan Docker Compose | PaaS Container: Railway, Render, Fly.io |
| **Database PostgreSQL** | PostgreSQL 16 bawaan `docker-compose.yml` (self-hosted, backup + DR tersedia — lihat `docs/DATABASE_OPERATIONS.md`) | Managed PostgreSQL: DigitalOcean, Supabase, Neon, AWS RDS (ditunda; roadmap di dokumen yang sama) |
| **Reverse Proxy & SSL** | Caddy Server (Otomatis HTTPS Let's Encrypt) atau Nginx | Cloudflare Proxy |
| **AI Model Gateway** | 9Router lokal (`http://localhost:20128/v1`) | OpenAI API Direct Fallback (`LLM_GATEWAY_PROVIDER=direct`) |

---

## 5. ENVIRONMENT VARIABLES PRODUKSI

Konfigurasikan variabel berikut pada server hosting (file `.env.production` atau environment secrets provider):

```ini
# --- Runtime ---
PORT=3000
NODE_ENV=production

# --- Database ---
DATABASE_URL=postgresql://astraops_app:YOUR_APP_SECURE_PASSWORD@postgres:5432/astraops
MIGRATION_DATABASE_URL=postgresql://astraops_admin:YOUR_ADMIN_SECURE_PASSWORD@postgres:5432/astraops
POSTGRES_PORT=5432

# --- Connection Pool ---
DB_POOL_MAX=10
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=5000

# --- Autentikasi Internal (Ganti dengan string random aman) ---
API_AUTH_TOKEN=generate-random-token-for-operator-session
ADMIN_AUTH_TOKEN=generate-random-token-for-admin-session
VIEWER_AUTH_TOKEN=generate-random-token-for-viewer-session

# --- Model Gateway ---
ROUTER_BASE_URL=http://localhost:20128/v1
LLM_GATEWAY_PROVIDER=9router

# --- Decoupled / CORS (Opsional) ---
NEXT_PUBLIC_API_URL=
CORS_ALLOWED_ORIGINS=*
```

---

## 6. LANGKAH DEPLOYMENT DARI REPOSITORY

### Opsi A: Deployment via Docker Compose (Metode Paling Mudah & Stabil)

1. **Clone repository pada server target:**
   ```bash
   git clone <REPOSITORY_URL> astraops
   cd astraops
   ```

2. **Buat file environment produksi:**
   ```bash
   cp .env.example .env
   # Edit variabel dengan kredensial kuat:
   nano .env
   ```

3. **Jalankan container platform:**
   ```bash
   docker compose up -d --build
   ```

4. **Jalankan migrasi database di dalam container:**
   ```bash
   docker compose exec app npm run db:migrate
   ```

5. **Periksa status container:**
   ```bash
   docker compose ps
   docker compose logs -f app
   ```

---

### Opsi B: Deployment pada Cloud PaaS (Railway / Render)

1. **Hubungkan GitHub Repository** ke project baru di Railway atau Render.
2. **Tambahkan Service PostgreSQL:** Buat database PostgreSQL 16 managed.
3. **Konfigurasikan Environment Variables:** Masukkan `DATABASE_URL`, `MIGRATION_DATABASE_URL`, dan token autentikasi.
4. **Build Command:** `npm run build`
5. **Start Command:** `npm run db:migrate && npm run start`

---

## 7. CARA SETUP DOMAIN & HTTPS

Jika menggunakan server VPS dengan domain sendiri (misalnya `logistikprima.com`):

### 1. Konfigurasi DNS di Registrar / Cloudflare
Tambahkan DNS Record:
- **Tipe:** `A`
- **Name:** `@` (atau subdomain seperti `app` / `logistik`)
- **Target IP:** `<IP_PUBLIC_SERVER_VPS>`
- **TTL:** Auto (atau 300)

### 2. Reverse Proxy Otomatis dengan Caddy (Rekomendasi)
Buat file `Caddyfile`:
```caddy
logistikprima.com {
    reverse_proxy localhost:3000
}
```
Jalankan Caddy (`caddy run`). Caddy akan secara otomatis menerbitkan dan memperbarui sertifikat HTTPS Let's Encrypt gratis tanpa konfigurasi manual.

---

## 8. SMOKE TEST SETELAH DEPLOYMENT

Setelah deployment aktif, jalankan verifikasi berikut:

1. **Akses Halaman Publik:**
   - Buka `https://<YOUR_DOMAIN>/` -> Pastikan beranda tampil dengan warna Blue & White korporat dan foto armada tampil natural.
   - Buka `/about`, `/services`, `/fleet-cargo`, `/industries`, `/operations-safety`, `/contact`.
2. **Uji Pengiriman Penawaran (End-to-End):**
   - Buka `https://<YOUR_DOMAIN>/quote`.
   - Isi Langkah 1 (Kontak), Langkah 2 (Muatan & Rute Jakarta -> Surabaya), Langkah 3 (Konfirmasi).
   - Klik **"Kirim Permintaan Penawaran Resmi"**.
   - Pastikan layar sukses muncul dengan nomor referensi unik (format: `TRK-XXXXXXXX`).
3. **Uji Akses Internal Business Desk:**
   - Buka `https://<YOUR_DOMAIN>/leads`.
   - Masuk menggunakan token autentikasi yang Anda atur (`API_AUTH_TOKEN` atau `ADMIN_AUTH_TOKEN`).
   - Pastikan inkuiri yang baru saja dikirim muncul pada daftar inkuiri masuk dengan status `INGESTED`.

---

## 9. PROSEDUR ROLLBACK

Jika terjadi kendala pada deployment versi baru:

1. **Rollback Kode:**
   ```bash
   git log -n 5 --oneline
   git checkout <COMMIT_SEBELUMNYA>
   docker compose up -d --build
   ```
2. **Rollback Database:**
   Tabel `schema_migrations` mencatat setiap file migrasi yang dieksekusi beserta checksum-nya. Jika tabel baru bermasalah, lakukan perbaikan struktural melalui migrasi maju berikutnya (*forward-fix migration*) untuk menjaga immutability riwayat database.

---

## 10. TINDAKAN YANG DIBUTUHKAN DARI PEMILIK PROYEK

Untuk meluncurkan aplikasi ini ke publik:
1. **Pilih Nama Domain yang Valid:** Tentukan domain yang akan digunakan (misalnya `logistikprima.com` atau subdomain `logistikprima.dannyportfolio.com`).
2. **Sediakan Hosting / Server:** Tentukan server target (VPS Docker, Railway, atau provider pilihan).
3. **Setel Environment Secret:** Ganti token default di `.env` produksi dengan secret key yang aman.
4. **Push Repository ke Remote Git:**
   ```bash
   git add .
   git commit -m "feat: complete corporate blue & white design system, cors, and deployment setup"
   git remote add origin https://github.com/<USERNAME>/<REPO_NAME>.git
   git push -u origin main
   ```
