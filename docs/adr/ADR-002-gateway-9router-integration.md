# ADR-002: Model Gateway Integration with 9Router & Dual-Adapter Strategy

**Status:** Accepted with Verification Gate  
**Deciders:** Staff Software Engineer, Agentic AI Architect  
**Date:** 2026-10-12  

---

## Context

AstraOps membutuhkan model gateway yang andal untuk mengarahkan permintaan inferensi LLM (seperti ekstraksi profil perusahaan, skoring ICP, dan pembuatan draft penawaran). Gateway ini diharapkan mampu menangani failover saat rate limit terjadi, mengoptimalkan biaya token, dan menyediakan antarmuka standar OpenAI-compatible.

Alat bernama **9Router** telah terpasang di lingkungan lokal pengembang. Namun, sebagai arsitek sistem, kita tidak boleh mendasarkan keputusan arsitektur kritis hanya pada klaim pemasaran sebelum melakukan klasifikasi fakta dan pengujian empiris.

---

## Technical Fact & Assumption Classification

Untuk memastikan integritas teknis, seluruh informasi terkait 9Router dikelompokkan ke dalam 3 kategori ketat:

### 1. Fakta Hasil Inspeksi (Empirical Inspection Facts)
- Biner `9router@0.5.50` terpasang secara global di mesin pengembang pada path `C:\Users\Lenovo X13\AppData\Roaming\npm\9router.cmd`.
- Biner dapat dipanggil melalui terminal shell Windows.
- Runtime Node.js pendukung adalah `v24.21.0`.

### 2. Fakta Dokumentasi (Documentation Facts)
- Dokumentasi resmi 9Router mengklaim mengekspos endpoint lokal OpenAI-compatible pada `http://localhost:20128/v1`.
- Menyediakan mekanisme *3-tier smart fallback* (Tier 1: primary paid, Tier 2: per-token backup, Tier 3: free tier).
- Menyediakan fitur kompresi token *Real-Time Token Compression (RTK)* dan *Caveman Mode* untuk menghemat biaya token.
- Beroperasi secara lokal tanpa mengirimkan kredensial API key ke server proprietary pihak ketiga yang tidak diketahui.

### 3. Hipotesis yang Memerlukan Pengujian (Hypotheses Requiring Verification)
Sebelum 9Router dapat dijadikan tumpuan mutlak pada jalur produksi, hipotesis berikut wajib diuji melalui test suite verifikasi:
- **Hipotesis 1 (Fidelitas Structured Output):** Apakah 9Router meneruskan parameter `response_format: { type: "json_schema", json_schema: ... }` secara utuh tanpa modifikasi payload ke model backend (misalnya OpenAI / Anthropic)?
- **Hipotesis 2 (Tool / Function Calling Pass-through):** Apakah 9Router mendukung skema tools OpenAI (`tools: [...]`, `tool_choice: "auto"`) tanpa merusak tipe Zod JSON schema?
- **Hipotesis 3 (Akurasi Pelaporan Token & Batasan Estimasi Heuristik):** Apakah objek `usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`) pada respons 9Router akurat setelah kompresi RTK diterapkan? Estimasi karakter (seperti karakter/3.5) tidak boleh diklaim menjamin hard ceiling biaya aktual. Oleh karena itu, akurasi pelaporan gateway dan sumber tarif tepercaya sangat krusial.
- **Hipotesis 4 (Latency Overhead):** Berapa millisecond latency overhead yang ditambahkan oleh local proxy 9Router per request dibandingkan koneksi langsung ke provider?
- **Hipotesis 5 (Daemon Lifecycle & Healthcheck):** Bagaimana perilaku sistem jika proses background 9Router crash di port 20128 saat batch scraping berjalan?

---

## Decision

Kami memutuskan untuk:
1. **Mempertahankan 9Router sebagai kandidat utama Model Gateway**, namun **tidak mengunci kode aplikasi secara langsung ke 9Router**.
2. **Menerapkan Adapter Pattern (`LlmGatewayClient`)**:
   - Seluruh pemanggilan LLM di AstraOps diisolasi di balik interface TypeScript `LlmGatewayClient`.
   - Mengimplementasikan 2 adapter konkret:
     - `NineRouterGatewayAdapter`: Mengarahkan base URL ke `http://localhost:20128/v1`.
     - `DirectOpenAiGatewayAdapter`: Mengarahkan langsung ke endpoint resmi provider (misal `https://api.openai.com/v1`).
3. **Menerapkan Verification Gate:**
   - Dibuat test suite verifikasi (`tests/integration/gateway-verification.test.ts`) untuk menguji 5 hipotesis di atas sebelum milestone deployment.
   - Konfigurasi gateway dikontrol melalui environment variable:
     ```env
     LLM_GATEWAY_PROVIDER=9router # opsi: 9router | direct
     LLM_GATEWAY_BASE_URL=http://localhost:20128/v1
     LLM_FALLBACK_ON_ERROR=true
     ```
   - Jika `LLM_FALLBACK_ON_ERROR=true` dan 9Router mengalami kegagalan koneksi lokal (ECONNREFUSED), adapter secara otomatis mengalihkan permintaan ke `DirectOpenAiGatewayAdapter`.
4. **Penegakan Cost Ceiling & Kebijakan Fail-Closed (Anti-Unbounded Cost):**
   - **Model Allowlist:** Adapter hanya mengizinkan pemanggilan ke model yang terdaftar dalam model allowlist eksplisit (`openai/gpt-4o-mini`, `openai/gpt-4o`, `anthropic/claude-3-5-sonnet` atau model lokal terverifikasi). Permintaan dengan model di luar allowlist ditolak seketika sebelum koneksi jaringan dibuka.
   - **Katalog Harga Tepercaya (Trusted Pricing Catalog):** Sistem menggunakan katalog harga internal terversi (`src/lib/gateway/pricing-catalog.ts`) untuk menghitung tarif token per 1M input dan output, dan tidak mempercayai klaim harga runtime dari gateway pihak ketiga tanpa verifikasi.
   - **Batas Output-Token Wajib (`max_tokens`):** Setiap request inferensi wajib menyertakan batas token completion maksimum eksplisit untuk membatasi pengeluaran token terburuk.
   - **Estimasi Biaya Maksimum Pre-Request:** Sebelum request dikirim, runtime menghitung estimasi biaya batas atas terburuk:
     `maxPotentialCost = (estimatedInputTokens * inputRate) + (maxTokens * outputRate)`.
     Jika estimasi ini melampaui sisa plafon anggaran ($0.50), request dibatalkan sebelum pengiriman.
   - **Penghitungan Usage Aktual:** Saat gateway mengembalikan objek `usage` yang terverifikasi, biaya aktual dihitung menggunakan tarif katalog tepercaya dan dicatat ke `agent_runs`.
   - **Kebijakan Fail-Closed Eksplisit:** Jika tarif model tidak terdaftar, atau jika metadata usage tidak dapat diverifikasi dan estimasi sisa anggaran tidak dapat dipertanggungjawabkan secara akuntabel, runtime menerapkan kebijakan fail-closed: eksekusi dihentikan dengan status `FAILED` (`UNVERIFIABLE_COST_HALT` / `BUDGET_EXCEEDED`) dan dilarang keras mengirim request berikutnya tanpa anggaran yang dapat dipertanggungjawabkan.
   - **Dokumentasi Residual Risk:** Didokumentasikan secara formal bahwa request inferensi yang sudah terkirim melalui jaringan tidak selalu dapat dibatalkan di tengah jalan (*in-flight cancellation*), tidak selalu dapat di-refund oleh provider upstream, dan biayanya mungkin tidak dapat diketahui secara presisi jika koneksi terputus sebelum metadata usage diterima. Risiko residual ini dimitigasi dengan batas timeout per-request (30s) dan budget run terikat.

---

## Consequences

### Positif:
- **Resiliensi Operasional:** Jika 9Router mengalami kendala, aplikasi dapat beralih ke provider langsung tanpa mengubah satu baris pun kode business logic.
- **Transparansi Biaya & Fail-Closed Safety:** Penegakan batas biaya tidak lagi bergantung pada estimasi heuristik semu, melainkan allowlist model, batas output token, katalog tarif tepercaya, dan mitigasi fail-closed.
- **Pemanfaatan Fitur Unggulan:** Jika verifikasi lolos, AstraOps mendapatkan manfaat fallback otomatis dan penghematan token RTK tanpa risiko crash fatal atau biaya tak terkontrol.

### Negatif:
- Memerlukan pemeliharaan dua implementasi adapter, katalog harga terversi, dan mock test suite verifikasi.
- Kebijakan fail-closed dapat menghentikan eksekusi jika gateway upstream tidak transparan mengembalikan objek usage.
