# Operasional Database — AstraOps / PT Trukindo Logistik Prima

**Versi:** 1.0.0 · **Tanggal:** Oktober 2026

Dokumen ini adalah runbook operasional untuk database PostgreSQL AstraOps.

> **Keputusan saat ini:** database berjalan **self-hosted lokal** (container PostgreSQL 16 via
> `docker-compose.yml`). Migrasi ke *managed PostgreSQL* **ditunda** dan didokumentasikan sebagai
> roadmap di Bagian 9. Kode sudah disiapkan agar perpindahan nanti tidak memerlukan perubahan besar.

---

## 1. Arsitektur Database Lokal

| Komponen | Nilai |
| :--- | :--- |
| Engine | PostgreSQL 16 (image `postgres:16-alpine`) |
| Container | `trukindo-postgres` (port host `5432`) |
| Database | `astraops` |
| Role admin/DDL | `astraops_admin` — pemilik skema, menjalankan migrasi |
| Role runtime | `astraops_app` — least-privilege, hanya `SELECT/INSERT/UPDATE` pada `leads` dan `SELECT/INSERT` pada `audit_logs` |
| Volume | `postgres_data` (persisten) |

`audit_logs` bersifat *append-only*: ada trigger immutability + pencabutan hak `UPDATE/DELETE/TRUNCATE`
untuk `astraops_app` (lihat ADR-004). Artinya **restore tidak boleh menghapus riwayat audit**.

Menjalankan database lokal:

```bash
docker compose up -d postgres
```

---

## 2. Connection Pool & Tuning Performa

Konfigurasi pool dibaca oleh `src/lib/config.ts` dan diterapkan di `src/lib/db.ts`.

| Variabel | Default | Fungsi |
| :--- | :--- | :--- |
| `DB_POOL_MAX` | `10` | Jumlah maksimum koneksi yang dipegang satu instance aplikasi. |
| `DB_IDLE_TIMEOUT_MS` | `30000` | Koneksi menganggur ditutup setelah 30 detik. |
| `DB_CONNECTION_TIMEOUT_MS` | `5000` | Batas waktu memperoleh koneksi dari pool. |
| `DB_APPLICATION_NAME` | `astraops` | Label yang muncul di `pg_stat_activity` untuk observability. |

**Panduan sizing.** Jaga agar `(jumlah instance) × DB_POOL_MAX` tetap di bawah `max_connections`
server. Untuk satu container, `DB_POOL_MAX=10` sudah cukup. `DB_CONNECTION_TIMEOUT_MS` yang terlalu
kecil dapat memicu kegagalan saat lonjakan; naikkan bila aplikasi di-deploy multi-instance.

> **Catatan pooler.** Bila kelak memakai connection pooler, turunkan `DB_POOL_MAX` per instance karena
> pooler yang melakukan multiplexing. Jangan menaikkan keduanya sekaligus.

---

## 3. Kesiapann TLS (untuk Managed DB di Masa Depan)

Transport TLS dikendalikan `DB_SSL_MODE` dengan default `auto` sehingga **perilaku lokal tidak berubah**.

| Mode | Perilaku |
| :--- | :--- |
| `auto` (default) | Menyerahkan ke `sslmode` pada connection string / default driver. Benar untuk lokal. |
| `disable` | Koneksi plaintext. Hanya untuk lokal. |
| `require` | Enkripsi transport tanpa memverifikasi rantai sertifikat. Umum untuk managed provider. |
| `verify-full` | Enkripsi + verifikasi sertifikat & hostname. Sediakan `DB_SSL_CA_CERT` bila CA provider tidak ada di trust store sistem. |

`DB_SSL_CA_CERT` boleh berupa satu baris dengan `\n` yang di-escape; nilai akan dinormalisasi otomatis.
Verifikasi status TLS aktual kapan pun dengan `npm run db:verify`.

---

## 4. Migrasi Skema

Migrasi memakai mekanisme mandiri (`scripts/migrate.mjs`) dengan **advisory lock** dan **verifikasi
checksum SHA256** (migrasi yang sudah diterapkan tidak boleh diubah — *forward-fix only*).

```bash
npm run db:migrate
```

Verifikasi:

```bash
npm run db:verify   # menampilkan jumlah migrasi yang sudah diterapkan
```

> **Penting untuk pooler.** Migrasi memakai *session-level* advisory lock yang **tidak andal pada
> transaction-pooling mode**. Karena itu `MIGRATION_DATABASE_URL` harus selalu menunjuk **koneksi
> langsung ke PostgreSQL (port 5432)**, bukan ke pooler. `DATABASE_URL` (runtime) boleh lewat pooler.
> Skema produksi: `MIGRATION_DATABASE_URL` = koneksi admin langsung, `DATABASE_URL` = koneksi app (opsional lewat pooler).

---

## 5. Backup Otomatis & Retensi 30 Hari

Backup logis dibuat dengan `pg_dump -Fc` (custom format) dan **retensi dipangkas otomatis**.

```bash
npm run db:backup
```

Perilaku:

- Menulis berkas ke `BACKUP_DIR` (default `./backups`) dengan nama `astraops_<ISO-8601>.dump`.
- Memangkas backup lebih tua dari `BACKUP_RETENTION_DAYS` (default **30 hari**).
- Menolak menulis bila dump kosong (fail-closed).
- Memilih tool secara otomatis (`BACKUP_MODE=auto`): memakai `pg_dump` di dalam container `postgres`
  agar **versi client cocok dengan server** (mencegah error versi seperti `transaction_timeout`).
  Bila tidak ada container berjalan (mis. DB managed), otomatis memakai `pg_dump` lokal.

Variabel terkait:

| Variabel | Default | Fungsi |
| :--- | :--- | :--- |
| `BACKUP_DIR` | `./backups` | Direktori tujuan backup. |
| `BACKUP_RETENTION_DAYS` | `30` | Jendela retensi (hari). |
| `BACKUP_MODE` | `auto` | `auto` \| `local` \| `docker`. |
| `BACKUP_DOCKER_SERVICE` | `postgres` | Nama service compose untuk mode docker. |

Direktori `backups/` dan `*.dump` sudah masuk `.gitignore` — **jangan** commit dump.

### Penjadwalan harian

**Linux (cron)** — setiap hari 02:00 WIB:

```cron
0 2 * * * cd /srv/astraops && /usr/bin/npm run db:backup >> /var/log/astraops-backup.log 2>&1
```

**macOS (launchd)** — simpan sebagai `~/Library/LaunchAgents/com.trukindo.dbbackup.plist` lalu
`launchctl load` plist tersebut:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>com.trukindo.dbbackup</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string><string>-lc</string>
      <string>cd /Users/mac/Dev/PT-Trukindo-Logistik-Prima &amp;&amp; npm run db:backup</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
  </dict>
</plist>
```

> **Rekomendasi:** salin hasil backup ke lokasi terpisah dari host database (object storage / NAS)
> setelah selesai, karena backup di host yang sama tidak melindungi dari kegagalan host.

---

## 6. Uji Coba Pemulihan (Disaster Recovery Drill)

Latihan restore dijalankan ke **database scratch terisolasi** sehingga database produksi tidak tersentuh.
Uji ini membuktikan backup benar-benar dapat dipulihkan.

```bash
npm run db:dr-drill                       # memakai backup terbaru di ./backups
npm run db:dr-drill -- path/ke/astraops_x.dump
```

Langkah yang dijalankan script:

1. Memilih backup terbaru (atau berkas yang diberikan).
2. Membuat database scratch `astraops_dr_<timestamp>`.
3. Restore dengan `pg_restore`.
4. **Verifikasi:** inventaris tabel sama dengan sumber, tabel wajib (`leads`, `audit_logs`,
   `schema_migrations`) ada, jumlah migrasi & baris cocok.
5. Menghapus database scratch (cleanup).

Interpretasi keluaran: `VERDICT: PASS` berarti backup sehat dan prosedur pulih berhasil.
`PASS (with drift)` berarti backup sehat tetapi ada penulisan baru sesudah backup.

**Jadwalkan drill ini minimal sebulan sekali** dan catat hasilnya. Contoh keluaran yang diharapkan:

```
[db:dr-drill] tables restored : 8 (source 8)
[db:dr-drill] migrations      : 4 applied in restored database
[db:dr-drill] VERDICT: PASS
```

### Prosedur restore nyata (produksi)

```bash
# 1) Hentikan penulisan aplikasi (stop container app / masuk maintenance).
# 2) Pulihkan ke database live (DESTRUKTIF — pastikan backup terverifikasi lebih dulu):
pg_restore -U astraops_admin -d astraops --clean --if-exists --no-owner --no-privileges \
  -Fc backups/astraops_<timestamp>.dump
# 3) Verifikasi lalu jalankan migrasi & uji koneksi:
npm run db:migrate && npm run db:verify
```

Untuk pemulihan titik-waktu (PITR) ke beberapa menit sebelum insiden, diperlukan WAL archiving /
managed DB — lihat roadmap Bagian 9.

---

## 7. Verifikasi Koneksi & Status

```bash
npm run db:verify
```

Menampilkan versi server, role/database aktif, status TLS, peran replikasi (primary/standby),
latensi round-trip, dan jumlah migrasi. Keluar dengan kode non-nol bila gagal, sehingga dapat dipakai
sebagai *readiness gate* pada deployment.

---

## 8. Connection Pooler Lokal (Opsional)

Untuk menguji perilaku pooler tanpa cloud, tersedia service `pgbouncer` dalam profil Docker opsional:

```bash
docker compose --profile pooler up -d
# lalu arahkan runtime ke pooler:
#   DATABASE_URL=postgresql://astraops_app:app_secure_password@localhost:6432/astraops
#   (biarkan MIGRATION_DATABASE_URL tetap di port 5432 — koneksi langsung)
```

Pooler berjalan dalam `POOL_MODE=transaction`, yaitu pola yang sama dengan Supabase Pooler/managed pooler.
Service ini **tidak** ikut terangkat pada `docker compose up -d` biasa.

---

## 9. Roadmap: Managed PostgreSQL (Ditunda)

Memenuhi kebutuhan produksi skala enterprise (High Availability, replikasi, retensi ≥30 hari,
PITR) tanpa mengelola server sendiri. Belum diaktifkan; dibutuhkan saat go-live publik.

### Matriks evaluasi provider

| Provider | Retensi backup | Pooler bawaan | Catatan |
| :--- | :--- | :--- | :--- |
| **DigitalOcean Managed DB** | Hingga 30 hari (semua tier) | Ya (PgBouncer) | Paling langsung memenuhi retensi 30 hari; harga transparan. |
| **Neon** | 7–30 hari tergantung plan | Ya (PgBouncer) | Serverless, scale-to-zero, branching bagus untuk drill DR. |
| **Supabase** | 7 hari (Pro) + add-on PITR | Ya (port 6543 transaction) | Selaras ADR-004; ekosistem terintegrasi. |
| **AWS RDS** | Hingga 35 hari | RDS Proxy (terpisah) | Paling enterprise; setup paling berat. |

**Rekomendasi utama:** DigitalOcean Managed PostgreSQL 16 — memenuhi seluruh syarat (retensi 30 hari,
pooler bawaan, SSL wajib, trusted sources) dengan biaya paling dapat diprediksi. Alternatif hemat:
Neon.

### Langkah migrasi (saat diaktifkan nanti)

1. Provisioning PostgreSQL 16 managed; buat role `astraops_admin` dan `astraops_app`.
2. Terapkan SSL: set `DB_SSL_MODE=require` (atau `verify-full` + `DB_SSL_CA_CERT`),
   tambahkan `?sslmode=require` pada connection string produksi.
3. Arahkan `MIGRATION_DATABASE_URL` ke **koneksi langsung** (5432).
4. Arahkan `DATABASE_URL` ke **endpoint pooler** dan turunkan `DB_POOL_MAX`.
5. Restore backup ke instance baru, lalu `npm run db:migrate` dan `npm run db:verify`.
6. Aktifkan backup harian provider + PITR; jadwalkan `npm run db:dr-drill` berkala.

---

## 10. Peta Checklist Kebutuhan

| Kebutuhan | Status | Bukti |
| :--- | :--- | :--- |
| Backend database (PostgreSQL 16) tersedia | Selesai (lokal) | `docker-compose.yml`, `npm run db:verify` |
| Backup harian otomatis | Selesai | `npm run db:backup` + penjadwalan |
| Retensi minimal 30 hari | Selesai | `BACKUP_RETENTION_DAYS=30` (default) |
| Uji coba pemulihan berkala | Selesai | `npm run db:dr-drill` (PASS) |
| Connection pool & tuning | Selesai | `DB_POOL_MAX` / `DB_IDLE_TIMEOUT_MS` / `DB_CONNECTION_TIMEOUT_MS` |
| Integrasi connection pooler | Opsional lokal; managed menyusul | profil `pooler` (PgBouncer) |
| SSL connection | Siap; menunggu managed | `DB_SSL_MODE`, `npm run db:verify` |
| Verifikasi migrasi | Selesai | `npm run db:migrate` (4 migrasi diterapkan) |
