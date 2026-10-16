# Spec Delta: Prospect Research

## Purpose

Delivers a sandboxed, SSRF-hardened web extraction engine that safely gathers public corporate data while neutralizing IPv4/IPv6 rebinding, redirect abuse, resource exhaustion, and indirect prompt injection attacks.

## ADDED Requirements

### Requirement: Protocol and Target Domain Restriction
The scraper tool SHALL strictly accept only `http:` and `https:` URLs targeting standard ports 80 and 443, ensuring requests are scoped strictly to the verified public domain of the target prospect lead.

#### Scenario: Valid public website URL
- **WHEN** the scraper receives a public HTTPS corporate URL for an ingested lead
- **THEN** the scraper validates the scheme and port and initiates pre-request DNS resolution

#### Scenario: Rejection of non-standard protocol or port
- **WHEN** a request targets `file:///etc/passwd` or `http://example.com:8080`
- **THEN** the scraper rejects the URL with an invalid protocol or port error before any network transmission occurs

### Requirement: Multi-Stack SSRF and DNS Rebinding Defenses
The research tool SHALL resolve hostnames prior to transmission and reject IPv4 (RFC 1918, loopback, link-local `169.254.169.254`, broadcast, multicast, 0.0.0.0/8), IPv6 (loopback `::1`, link-local `fe80::/10`, unique local `fc00::/7`, multicast, unspecified `::/128`), IPv4-mapped IPv6 (`::ffff:0:0/96`), and non-global unicast ranges, pinning safe IPs to sockets while preserving HTTP Host and TLS SNI headers.

#### Scenario: Private IPv4 and IPv6 blocked
- **WHEN** a target hostname resolves to `127.0.0.1`, `10.0.0.1`, `192.168.1.1`, `::1`, or `fe80::1`
- **THEN** the scraper halts connection and returns an SSRF security violation error

#### Scenario: IPv4-mapped IPv6 address blocked
- **WHEN** a target hostname resolves to `::ffff:127.0.0.1` or `::ffff:169.254.169.254`
- **THEN** the scraper unmaps the address, identifies the private/metadata range, and halts connection immediately

#### Scenario: DNS rebinding protection via socket IP pinning
- **WHEN** the HTTP connection is opened for a verified safe IP
- **THEN** the socket connects directly to the validated IP with the original hostname placed in the HTTP Host header and TLS SNI

### Requirement: Resource Limits, Manual Redirects, and Bounded Transient Retry
The scraper SHALL enforce a 10s socket timeout, a 2MB streaming payload ceiling, max 3 manual redirect hops with per-hop IP re-validation, and allow exactly one transient retry for recoverable failures (HTTP 429, 502–504, ECONNRESET) with jitter and Retry-After compliance, while rejecting retries for SSRF, TLS, or invalid URLs.

#### Scenario: Response payload exceeds size limit
- **WHEN** a remote server transmits a response body exceeding 2MB
- **THEN** the scraper terminates the streaming connection and returns a payload size limit exceeded error

#### Scenario: Manual redirect hop re-validation
- **WHEN** a website responds with a 302 redirect targeting an internal network address
- **THEN** the scraper re-resolves the target IP, detects the forbidden subnet, and aborts the request

#### Scenario: Recoverable failure transient retry
- **WHEN** a request encounters an HTTP 503 or 429 response on its initial attempt
- **THEN** the scraper performs exactly one retry using exponential backoff with jitter while respecting Retry-After, staying within the 120-second run deadline

#### Scenario: Non-retryable error immediate termination
- **WHEN** a request encounters an SSRF violation, invalid URL, or TLS certificate mismatch
- **THEN** the scraper terminates immediately with zero retry attempts

### Requirement: HTML Sanitization and Untrusted Content Quarantine
The research tool SHALL parse HTML using Cheerio, strip all script, iframe, style, SVG, form, and hidden DOM elements, extract clean readable text, and wrap the content in an XML `<untrusted_scraped_data>` envelope to isolate untrusted content.

#### Scenario: Malicious scripts and hidden elements stripped
- **WHEN** a scraped page contains `<script>`, `<iframe>`, or `style="display:none"` tags
- **THEN** the sanitization pipeline removes all executable and hidden elements from the extracted text

#### Scenario: Untrusted data quarantine packaging
- **WHEN** clean text is prepared for downstream fact extraction
- **THEN** the payload is encapsulated within `<untrusted_scraped_data>` tags alongside strict system prompt boundaries
