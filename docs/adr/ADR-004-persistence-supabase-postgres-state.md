# ADR-004: Persistence, State Checkpointing & Audit Integrity Strategy

**Status:** Accepted  
**Deciders:** Staff Software Engineer, Agentic AI Architect  
**Date:** 2026-10-12  

---

## Context

Platform AI Agent AstraOps memerlukan layer penyimpanan persisten yang andal untuk:
1. Menyimpan data relasional prospek, hasil riset perusahaan, skor kualifikasi ICP, dan draft penawaran.
2. Menyimpan status eksekusi agent (*Agent Execution State*) dan checkpointing per langkah sehingga eksekusi dapat pulih (*recover*) setelah terjadi crash proses.
3. Mencatat jejak audit (*audit trail*) atas semua intervensi manusia dan mutasi state yang bernilai bisnis.

Persyaratan eksplisit pengguna:
> *"Audit log MVP tidak boleh diklaim tamper-resistant tanpa mekanisme yang membuktikannya."*

Oleh karena itu, arsitektur persistence harus mendefinisikan secara jujur dan presisi apa mekanisme integritas yang diterapkan pada MVP, tanpa mengklaim sifat kriptografis yang belum diimplementasikan.

---

## Decision

Kami memutuskan untuk:
1. **Menggunakan PostgreSQL (via Supabase)** sebagai layer persistensi relasional dan state storage utama.
2. **Menerapkan Granular State Checkpointing & Optimistic Concurrency Control:**
   - Tabel `agent_runs` menyimpan state aktif saat ini (`current_state`), `step_count`, `cost_accrued_usd`, dan `checkpoint_data` (JSONB).
   - Kolom `version_id` (integer) digunakan untuk optimistic locking. Transisi state hanya berhasil jika `UPDATE agent_runs SET current_state = $1, version_id = version_id + 1 WHERE id = $2 AND version_id = $old_version`. Hal ini mencegah *race condition* jika ada beberapa proses worker paralel.
   - Setiap pemanggilan tool dicatat ke tabel `agent_steps` secara append-only.
3. **Mekanisme Integritas Audit Log MVP (Bukan Kriptografis, Melainkan Database Privilege Hardening):**
   - **Klarifikasi:** Audit log pada MVP **bukanlah sistem cryptographic tamper-evident** (seperti block header hash-chaining atau blockchain).
   - **Mekanisme yang Benar-Benar Ditegakkan:**
     - **Tabel Append-Only:** Tabel `audit_logs` hanya mengizinkan operasi `INSERT` dan `SELECT`.
     - **Pencabutan Izin Tingkat Database:** Role koneksi aplikasi (`astraops_app`) secara eksplisit dicabut haknya untuk memodifikasi atau menghapus log audit:
       ```sql
       REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM astraops_app;
       ```
     - **Trigger Immutability (Defense in Depth):** Dibuat PostgreSQL trigger yang melempar exception fatal jika perintah `UPDATE` atau `DELETE` dicoba dieksekusi bahkan oleh superuser:
       ```sql
       CREATE OR REPLACE FUNCTION enforce_audit_immutability()
       RETURNS TRIGGER AS $$
       BEGIN
           RAISE EXCEPTION 'Audit log records are immutable and cannot be modified or deleted.';
       END;
       $$ LANGUAGE plpgsql;

       CREATE TRIGGER trg_audit_immutable
       BEFORE UPDATE OR DELETE ON audit_logs
       FOR EACH ROW EXECUTE FUNCTION enforce_audit_immutability();
       ```
4. **Strategi Pemulihan dari Kegagalan Proses (Crash Recovery):**
   - Jika runtime worker mati mendadak saat menjalankan tool (misal OOM atau restart server), state di database tetap berada pada checkpoint terakhir yang berhasil di-commit.
   - Endpoint pemulihan / cron recovery memeriksa `agent_runs` dengan `state IN ('RESEARCHING', 'SCORING', 'DRAFTING_PROPOSAL', 'DISPATCHING_N8N')` yang tidak mengalami update selama lebih dari 5 menit.
   - Worker membaca `checkpoint_data` dan memulai ulang langkah tersebut secara aman berkat verifikasi `idempotency_key`.

---

## Consequences

### Positif:
- **Kejujuran Arsitektur:** Tidak ada klaim berlebihan mengenai "tamper-resistance" tanpa dasar. Sistem jujur mencatat proteksi berbasis hak akses database dan trigger immutability.
- **Konsistensi Data Tinggi:** Menggunakan transaksi PostgreSQL ACID menjamin integritas data prospek, run state, dan skor.
- **Auditabilitas Nyata:** Setiap tindakan persetujuan proposal mencatat identitas operator (`actor_id`), IP, timestamp UTC, snapshot sebelum revisi, dan teks hasil revisi.

### Negatif:
- Database administrator (DBA) yang memiliki akses tingkat root OS/server database secara teoretis masih dapat memodifikasi disk mentah (fitur hash-chaining kriptografis atau WORM storage dicadangkan untuk roadmap Enterprise pasca-MVP).
