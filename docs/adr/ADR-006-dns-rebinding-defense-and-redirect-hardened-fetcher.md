# ADR-006: IP-Pinned Socket Architecture, Multi-Stack IP Filtering, and Recursive Redirect Hardening for SSRF Defense

**Status:** Accepted  
**Deciders:** Staff Software Engineer, Security Architect  
**Date:** 2026-10-13  

---

## Context

Pada Milestone 2 AstraOps, agent mengeksekusi riset prospek otomatis dengan mengambil konten dari URL website publik target (`website_url` milik lead). Pada ADR-005, kami telah menetapkan arsitektur pertahanan *Defense in Depth* berbasis validasi skema, port, dan daftar hitam CIDR IP.

Namun, implementasi scraper HTTP standar (seperti `fetch(url)` bawaan atau Axios) masih memiliki celah keamanan kritis pada lapisan transport, resolusi DNS, dan penanganan retry:

1. **DNS Rebinding (TOCTOU Attack):**
   Penyerang dapat mengonfigurasi server DNS otoritatif dengan TTL 0 detik. Saat resolusi DNS pra-pemeriksaan dilakukan oleh aplikasi, DNS mengembalikan IP publik yang sah (`203.0.113.1`). Namun beberapa milidetik kemudian saat library HTTP membuka koneksi TCP/TLS sebenarnya, hostname di-resolve ulang dan mengembalikan IP privat (`169.254.169.254` atau `127.0.0.1`).
2. **Evasion melalui IPv6 dan IPv4-Mapped IPv6:**
   Penyerang dapat menggunakan representasi IPv4-mapped IPv6 (seperti `::ffff:127.0.0.1` atau `::ffff:169.254.169.254`) atau alamat non-global unicast untuk mengelabui filter IPv4 konvensional.
3. **Redirect-Chained SSRF:**
   Server publik yang awalnya aman dapat merespons dengan HTTP redirect 301/302 menuju alamat internal (misal `Location: http://192.168.1.10/api/keys` atau `http://169.254.169.254/latest/meta-data/`). Library HTTP yang secara otomatis mengikuti redirect (`redirect: "follow"`) akan membocorkan data internal tanpa melalui filter SSRF awal.
4. **Slow-Loris & Unbounded Response Memory Exhaustion:**
   Server target dapat mengirimkan stream data tak berujung (*infinite byte stream*) atau respons sebesar puluhan megabyte, menyebabkan konsumsi memori berlebih (*Out-Of-Memory DoS*) pada runtime Node.js.
5. **Unconstrained Retry Loops:**
   Retry tanpa batas atau retry pada kegagalan keamanan (seperti penolakan SSRF atau sertifikat TLS tidak valid) dapat memicu amplifikasi request dan pemborosan kuota runtime.

---

## Decision

Kami memutuskan untuk mengimplementasikan custom network fetcher di `src/lib/agent/tools/ssrf-guard.ts` dan `src/lib/agent/tools/scraper.ts` dengan kontrol tingkat soket (*socket-level pinning*), validasi IP multi-stack, penanganan redirect manual, dan kebijakan retry yang terikat batas:

### 1. Pre-Resolution & Multi-Stack IP Blacklist Filtering
- Sebelum membuka soket TCP, hostname di-resolve menggunakan `dns.promises.lookup(hostname, { all: true })`.
- Seluruh alamat IP hasil resolusi divalidasi menggunakan pustaka `ipaddr.js`:
  - **IPv4:** Loopback (`127.0.0.0/8`), Private subnets (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), Link-Local & Cloud Metadata (`169.254.0.0/16`), Current network (`0.0.0.0/8`), Broadcast (`255.255.255.255`), Multicast (`224.0.0.0/4`).
  - **IPv6:** Loopback (`::1`), Link-Local (`fe80::/10`), Unique Local (RFC 4193: `fc00::/7`), Multicast (`ff00::/8`), Unspecified (`::/128`).
  - **IPv4-Mapped IPv6 & IPv4-Compatible:** Rentang `::ffff:0:0/96` diekstraksi ke alamat IPv4 dasarnya dan diperiksa terhadap seluruh aturan IPv4 di atas. Rentang `::/96` ditolak.
  - **Non-Global Unicast:** Seluruh alamat IP yang tergolong non-global berdasarkan RFC 6890 ditolak.

### 2. Socket IP Pinning & Host/SNI Preservation
- Permintaan HTTP dikirimkan langsung ke IP yang telah tervalidasi aman pada lapisan socket.
- Header `Host` disetel secara eksplisit ke hostname domain target asli.
- Konfigurasi TLS Server Name Indication (SNI) disetel ke hostname target, menjamin validasi sertifikat TLS tetap sah tanpa memicu DNS lookup sekunder.
- Serangan DNS rebinding (TOCTOU) secara fisik dinetralkan karena tidak ada proses resolusi nama host kedua saat koneksi TCP/TLS dibuka.

### 3. Manual Recursive Redirect Validation (Max 3 Hops)
- Permintaan HTTP mengonfigurasi opsi `redirect: "manual"`.
- Jika server mengembalikan status HTTP 301, 302, 303, 307, atau 308:
  1. Header `Location` diekstraksi dan dikonversi menjadi URL absolut.
  2. Protocol diperiksa (`http:` atau `https:` saja pada port 80/443).
  3. Hostname tujuan redirect melalui siklus resolusi DNS dan validasi blacklist dari awal.
  4. Jumlah redirect dibatasi maksimal **3 hop**. Jika melebihi 3 hop, koneksi dibatalkan dengan error `MAX_REDIRECTS_EXCEEDED`.

### 4. Streaming Payload Limit & Socket Timeout
- Koneksi dibatasi oleh `AbortController` dengan timeout keras **10 detik**.
- Data respons dibaca melalui streaming byte counter. Segera setelah akumulasi ukuran data melebihi **2MB**, streaming diputus seketika via `reader.cancel()` atau `stream.destroy()`.

### 5. Bounded Transient Retry Policy
- **Kegagalan Dapat Dipulihkan (Recoverable):** HTTP 429 (Rate Limit), 502 (Bad Gateway), 503 (Service Unavailable), 504 (Gateway Timeout), dan `ECONNRESET`.
- **Batas Percobaan:** Maksimal **1 kali retry**.
- **Mekanisme Backoff:** Exponential backoff dengan jitter acak (1.5s ± 0.5s). Mematuhi header `Retry-After` dari server (maksimal tunggu 10s).
- **Kegagalan Permanen (Non-Retryable):** Penolakan SSRF, URL invalid, kesalahan sertifikat TLS, HTTP 400/401/403/404 digagalkan seketika tanpa retry (0 retry).
- **Batas Global:** Seluruh retry wajib selesai dalam tenggat waktu eksekusi run (120 detik) dan anggaran biaya ($0.50). Percobaan retry dicatat secara persisten di tabel `agent_steps`.

---

## Consequences

### Positif:
- **Kekebalan Mutlak terhadap DNS Rebinding:** Socket IP pinning meniadakan celah resolusi ganda antara time-of-check dan time-of-use.
- **Cakupan Multi-Stack Lengkap:** Melindungi dari teknik penghindaran menggunakan IPv6 dan IPv4-mapped IPv6.
- **Isolasi Redirect Total:** Setiap hop redirect diperlakukan sebagai entitas baru yang harus lolos filter keamanan penuh.
- **Resiliensi Terkendali:** Retry 1x dengan jitter dan `Retry-After` memberikan toleransi terhadap fluktuasi jaringan sementara tanpa membocorkan sumber daya atau memperpanjang waktu tunggu di luar batas deadline.

### Negatif:
- Memerlukan custom agent dispatcher pada layer transport Node.js untuk mengatur IP pinning bersama TLS SNI.
