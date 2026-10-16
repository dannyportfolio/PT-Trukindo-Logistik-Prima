# ADR-008: Database Operations, Backup Retention & High-Availability Strategy

**Status:** Accepted
**Deciders:** Staff Software Engineer, Agentic AI Architect
**Date:** 2026-10-16

---

## Context

Data transaksi logistik AstraOps (leads, audit log yang bersifat *append-only*, riwayat penawaran
harga, state agent) memerlukan ketersediaan tinggi, pencadangan harian, serta perlindungan terhadap
kehilangan data. Kebutuhan yang dinyatakan:

1. Database transaksional memerlukan High Availability, replikasi, dan backup harian otomatis
   dengan retensi minimal 30 hari.
2. Perlu mengevaluasi penggunaan Managed PostgreSQL (Supabase / Neon / AWS RDS / DigitalOcean).
3. Perlu connection pooling untuk menangani lonjakan koneksi dari aplikasi multi-instance.
4. Koneksi produksi harus menggunakan SSL (`sslmode=require`).

Kendala saat ini: **managed PostgreSQL belum akan digunakan** — pengembangan masih pada tahap lokal.
Namun strategi backup, retensi, dan kesiapan migrasi tetap harus nyata dan dapat diuji.

---

## Decision

1. **Tetap self-hosted PostgreSQL 16 lokal untuk saat ini.** Managed PostgreSQL **ditunda** hingga
   fase go-live publik (lihat roadmap di `docs/DATABASE_OPERATIONS.md`).

2. **Backup logis otomatis dengan retensi 30 hari**, diimplementasikan sebagai script yang dapat
   diuji (`scripts/backup-db.mjs`, `npm run db:backup`):
   - `pg_dump --format=custom`, pemangkasan otomatis backup lebih tua dari `BACKUP_RETENTION_DAYS`
     (default 30 hari), dan gagal (fail-closed) bila dump kosong.
   - Penjadwalan harian via cron (Linux) atau launchd (macOS).

3. **Disaster-recovery drill yang dapat diulang** (`scripts/db-dr-drill.mjs`, `npm run db:dr-drill`):
   restore backup ke database *scratch* terisolasi, verifikasi inventaris tabel + jumlah baris +
   jumlah migrasi, lalu bersihkan diri sendiri. Memberi vonis PASS/FAIL yang dapat diaudit.

4. **Verifikasi koneksi sebagai readiness gate** (`scripts/verify-db-connection.mjs`, `npm run db:verify`):
   melaporkan versi server, role, status TLS aktual, peran replikasi, latensi, dan jumlah migrasi.

5. **Kesiapan TLS/provider-agnostic tanpa perubahan perilaku lokal.** `DB_SSL_MODE`
   (`auto` default) + `DB_SSL_CA_CERT` diterjemahkan menjadi opsi `ssl` node-postgres di
   `src/lib/db.ts`. Mode `auto` menjadikan lokal tetap plaintext seperti sebelumnya, sementara
   managed DB nantinya cukup memakai `require`/`verify-full`.

6. **Keselarasan tool versi.** Script memilih otomatis (`BACKUP_MODE=auto`) antara `pg_dump`/`pg_restore`
   di dalam container (versi cocok dengan server) dan binary lokal, guna mencegah error versi
   (mis. `SET transaction_timeout` dari client yang lebih baru ditolak server 16).

7. **Pooler menyusul, bukan sekarang.** Disiapkan sebagai profil Docker opsional (`--profile pooler`,
   PgBouncer `POOL_MODE=transaction`) untuk parity dengan managed pooler. Migrasi tetap **wajib**
   memakai koneksi langsung (port 5432) karena advisory lock session-level tidak andal pada
   transaction-pooling mode.

---

## Consequences

### Positif
- **Persyaratan terpenuhi tanpa biaya cloud:** backup harian + retensi 30 hari + drill pemulihan
  sudah berjalan dan terbukti (drill berstatus PASS).
- **Fail-closed & teruji:** backup kosong ditolak; drill memverifikasi hasil restore, bukan sekadar
  mengklaim sukses.
- **Migrasi ke managed nanti murah:** kode sudah provider-agnostic dan mendukung TLS; hanya
  connection string + `DB_SSL_MODE` yang berubah.
- **Observability:** `application_name` dan `npm run db:verify` memudahkan diagnosis.

### Negatif / Batasan (jujur)
- **Belum ada HA/replikasi/PITR nyata.** Self-hosted lokal adalah *single point of failure*; RPO
  bergantung pada cadence backup (harian → RPO hingga 24 jam). PITR dan replikasi baru tersedia
  setelah managed DB / WAL archiving diaktifkan.
- **Backup di host yang sama tidak melindungi dari kegagalan host** — perlu penyalinan off-host
  (didokumentasikan sebagai rekomendasi, belum diotomasi).
- **Ukuran dump tumbuh seiring data**; strategi *incremental/PITR* ditunda bersama keputusan managed DB.

---

## Follow-up

- Aktifkan managed PostgreSQL + PITR + replikasi sebelum go-live publik.
- Otomasi penyalinan backup ke object storage off-host.
- Jadwalkan `npm run db:dr-drill` berkala (minimal bulanan) dan simpan lognya sebagai bukti audit.
