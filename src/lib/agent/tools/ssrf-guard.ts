import http from "http";
import https from "https";
import net from "net";
import tls from "tls";
import dns from "dns";
import ipaddr from "ipaddr.js";

/**
 * Base error class for all SSRF and network security violations.
 */
export class SsrfError extends Error {
  constructor(message: string, public readonly code: string = "SSRF_VIOLATION") {
    super(message);
    this.name = "SsrfError";
  }
}

export class InvalidUrlError extends SsrfError {
  constructor(message: string) {
    super(message, "INVALID_URL");
    this.name = "InvalidUrlError";
  }
}

export class ProhibitedSchemeError extends SsrfError {
  constructor(protocol: string) {
    super(
      `Prohibited scheme '${protocol}'. Only HTTP: and HTTPS: are permitted.`,
      "PROHIBITED_SCHEME"
    );
    this.name = "ProhibitedSchemeError";
  }
}

export class ProhibitedPortError extends SsrfError {
  constructor(port: number | string) {
    super(
      `Prohibited destination port '${port}'. Only standard ports 80 and 443 are allowed.`,
      "PROHIBITED_PORT"
    );
    this.name = "ProhibitedPortError";
  }
}

export class UserInfoNotAllowedError extends SsrfError {
  constructor() {
    super(
      "URLs with embedded user credentials (user:password@host) are strictly prohibited.",
      "USERINFO_NOT_ALLOWED"
    );
    this.name = "UserInfoNotAllowedError";
  }
}

export class DnsResolutionError extends SsrfError {
  constructor(hostname: string, reason: string = "Failed to resolve hostname") {
    super(`DNS resolution error for '${hostname}': ${reason}`, "DNS_RESOLUTION_FAILED");
    this.name = "DnsResolutionError";
  }
}

export class ProhibitedIpError extends SsrfError {
  constructor(ip: string, reason: string) {
    super(
      `Prohibited IP address '${ip}' rejected by SSRF guardrail: ${reason}`,
      "PROHIBITED_IP"
    );
    this.name = "ProhibitedIpError";
  }
}

export interface ValidatedTarget {
  originalUrl: string;
  parsedUrl: URL;
  hostname: string;
  port: number;
  protocol: "http:" | "https:";
  pinnedIp: string;
  isIpv6: boolean;
  resolvedIps: string[];
}

export type DnsLookupFn = (
  hostname: string,
  options: { all: boolean }
) => Promise<dns.LookupAddress[] | dns.LookupAddress>;

export interface ValidateTargetOptions {
  dnsLookupFn?: DnsLookupFn;
  allowPrivateIpsForTesting?: boolean;
  allowCustomPortsForTesting?: boolean;
}

/**
 * IANA IPv6 Special-Purpose Address Registry CIDRs (RFC 6890 / RFC 2928 / RFC 3849 / RFC 3056 / RFC 6052 / RFC 8215 / RFC 6666 / RFC 7534 / RFC 9637).
 * Evaluated to ensure no special-purpose, transition, translation, benchmarking, or discard ranges
 * within 2000::/3 or global routing table are treated as safe public unicast.
 */
export const IPV6_SPECIAL_PURPOSE_CIDRS: Array<{
  cidr: [ipaddr.IPv6, number];
  name: string;
  rfc: string;
}> = [
  // IETF Protocol Assignments (covers TEREDO, PCP/TURN anycast, Benchmarking, AMT, AS112, ORCHID, Drone Remote ID, MTI)
  { cidr: ipaddr.IPv6.parseCIDR("2001::/23"), name: "IETF Protocol Assignments", rfc: "RFC 2928" },
  // IPv6 Documentation prefixes
  { cidr: ipaddr.IPv6.parseCIDR("2001:db8::/32"), name: "IPv6 Documentation prefix", rfc: "RFC 3849" },
  { cidr: ipaddr.IPv6.parseCIDR("3fff::/20"), name: "IPv6 Documentation prefix", rfc: "RFC 9637" },
  // 6to4 Anycast / Transition prefix
  { cidr: ipaddr.IPv6.parseCIDR("2002::/16"), name: "6to4 transition prefix", rfc: "RFC 3056" },
  // Direct Delegation AS112 Service
  { cidr: ipaddr.IPv6.parseCIDR("2620:4f:8000::/48"), name: "Direct Delegation AS112 Service", rfc: "RFC 7534" },
  // IPv4/IPv6 Translation (NAT64 Well-Known and Local-Use)
  { cidr: ipaddr.IPv6.parseCIDR("64:ff9b::/96"), name: "IPv4/IPv6 Translation (NAT64 Well-Known)", rfc: "RFC 6052" },
  { cidr: ipaddr.IPv6.parseCIDR("64:ff9b:1::/48"), name: "IPv4/IPv6 Translation (NAT64 Local-Use)", rfc: "RFC 8215" },
  // Discard-Only prefix
  { cidr: ipaddr.IPv6.parseCIDR("100::/64"), name: "Discard-Only prefix", rfc: "RFC 6666" },
];

/**
 * Validates whether an IP address belongs to a prohibited or non-global range.
 * Evaluates IPv4, IPv6, IPv4-mapped IPv6, loopback, private, link-local, cloud metadata,
 * carrier-grade NAT, and RFC 6890 non-global unicast ranges.
 */
export function isIpProhibited(
  ip: string,
  options: { allowPrivateIpsForTesting?: boolean } = {}
): { prohibited: boolean; reason?: string } {
  if (options.allowPrivateIpsForTesting) {
    return { prohibited: false };
  }

  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return { prohibited: true, reason: "Malformed or unparseable IP address format" };
  }

  // Handle IPv4-Mapped IPv6 (::ffff:0:0/96)
  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }

  if (addr.kind() === "ipv4") {
    const ipv4 = addr as ipaddr.IPv4;
    const range = ipv4.range();

    // Specific check for Cloud Provider Metadata Service (169.254.169.254)
    if (ipv4.toString() === "169.254.169.254") {
      return { prohibited: true, reason: "Cloud provider metadata endpoint (169.254.169.254) is prohibited" };
    }

    switch (range) {
      case "loopback":
        return { prohibited: true, reason: `IPv4 loopback address (${ip}) is prohibited` };
      case "private":
        return { prohibited: true, reason: `RFC 1918 private subnet address (${ip}) is prohibited` };
      case "linkLocal":
        return { prohibited: true, reason: `IPv4 link-local address (${ip}) is prohibited` };
      case "unspecified":
        return { prohibited: true, reason: `IPv4 current network/unspecified address (${ip}) is prohibited` };
      case "broadcast":
        return { prohibited: true, reason: `IPv4 broadcast address (${ip}) is prohibited` };
      case "multicast":
        return { prohibited: true, reason: `IPv4 multicast address (${ip}) is prohibited` };
      case "carrierGradeNat":
        return { prohibited: true, reason: `RFC 6598 Carrier-Grade NAT address (${ip}) is prohibited` };
      case "reserved":
        return { prohibited: true, reason: `Reserved/Test network address (${ip}) is prohibited` };
      case "unicast":
        return { prohibited: false };
      default:
        return { prohibited: true, reason: `Non-global IPv4 address (${ip}) in range '${range}'` };
    }
  }

  if (addr.kind() === "ipv6") {
    const ipv6 = addr as ipaddr.IPv6;
    const range = ipv6.range();

    // 1. Check built-in non-unicast ranges from ipaddr.js
    if (range !== "unicast") {
      return {
        prohibited: true,
        reason: `IPv6 special-purpose address (${ip}) in range '${range}' is prohibited`,
      };
    }

    // 2. Enforce Global Unicast range (2000::/3 - RFC 4291)
    const firstWord = ipv6.parts[0];
    if ((firstWord & 0xe000) !== 0x2000) {
      return {
        prohibited: true,
        reason: `Non-global IPv6 unicast address (${ip}) outside 2000::/3`,
      };
    }

    // 3. Reject IANA IPv6 Special-Purpose Address Registry CIDRs within 2000::/3
    for (const entry of IPV6_SPECIAL_PURPOSE_CIDRS) {
      if (ipv6.match(entry.cidr)) {
        return {
          prohibited: true,
          reason: `IPv6 special-purpose address (${ip}) prohibited: ${entry.name} (${entry.rfc})`,
        };
      }
    }

    return { prohibited: false };
  }

  return { prohibited: true, reason: "Unrecognized IP address kind" };
}

/**
 * Validates URL string syntax, scheme (http/https), port (80/443), and userinfo presence.
 */
export function validateUrl(
  rawUrl: string,
  options: { allowCustomPortsForTesting?: boolean } = {}
): URL {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new InvalidUrlError("URL must be a non-empty string");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new InvalidUrlError(`Malformed URL: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Enforce protocol allowlist
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProhibitedSchemeError(parsed.protocol);
  }

  // Reject embedded credentials (user:password@host)
  if (parsed.username || parsed.password) {
    throw new UserInfoNotAllowedError();
  }

  // Enforce standard ports (80 for http, 443 for https) unless explicitly allowed for test harness
  if (parsed.port && !options.allowCustomPortsForTesting) {
    const numericPort = Number(parsed.port);
    if (parsed.protocol === "http:" && numericPort !== 80) {
      throw new ProhibitedPortError(numericPort);
    }
    if (parsed.protocol === "https:" && numericPort !== 443) {
      throw new ProhibitedPortError(numericPort);
    }
  }

  if (!parsed.hostname || parsed.hostname.trim() === "") {
    throw new InvalidUrlError("URL must include a valid target hostname");
  }

  return parsed;
}

/**
 * Resolves target hostname to IP addresses, validates all resolved addresses against
 * multi-stack CIDR rules, and selects a pinned IP for direct socket connection.
 */
export async function validateAndPinTarget(
  rawUrl: string,
  options: ValidateTargetOptions = {}
): Promise<ValidatedTarget> {
  const parsed = validateUrl(rawUrl, options);
  const hostname = parsed.hostname.toLowerCase();
  const protocol = parsed.protocol as "http:" | "https:";
  const port = parsed.port
    ? Number(parsed.port)
    : protocol === "https:"
    ? 443
    : 80;

  let resolvedAddresses: string[] = [];

  // If hostname is already an IP literal
  if (ipaddr.isValid(hostname)) {
    const check = isIpProhibited(hostname, options);
    if (check.prohibited) {
      throw new ProhibitedIpError(hostname, check.reason || "Forbidden IP literal");
    }
    resolvedAddresses = [hostname];
  } else {
    // Perform pre-request DNS resolution
    const lookupFn = options.dnsLookupFn ?? dns.promises.lookup;
    let rawRecords: dns.LookupAddress[] | dns.LookupAddress;

    try {
      rawRecords = await lookupFn(hostname, { all: true });
    } catch (err) {
      throw new DnsResolutionError(
        hostname,
        err instanceof Error ? err.message : String(err)
      );
    }

    const records: dns.LookupAddress[] = Array.isArray(rawRecords)
      ? rawRecords
      : [rawRecords];

    if (!records || records.length === 0) {
      throw new DnsResolutionError(hostname, "Hostname resolved to 0 IP addresses");
    }

    resolvedAddresses = records.map((r) => r.address);

    // Verify EVERY resolved IP address against multi-stack security rules
    for (const addr of resolvedAddresses) {
      const check = isIpProhibited(addr, options);
      if (check.prohibited) {
        throw new ProhibitedIpError(
          addr,
          `Hostname '${hostname}' resolved to prohibited IP address '${addr}': ${check.reason}`
        );
      }
    }
  }

  // Pin the first safe validated IP address
  const pinnedIp = resolvedAddresses[0];
  const isIpv6 = ipaddr.parse(pinnedIp).kind() === "ipv6";

  return {
    originalUrl: rawUrl,
    parsedUrl: parsed,
    hostname,
    port,
    protocol,
    pinnedIp,
    isIpv6,
    resolvedIps: resolvedAddresses,
  };
}

/**
 * Custom HTTP agent that forces socket connection directly to target.pinnedIp
 * while preserving target.hostname in the HTTP Host header.
 */
export class PinnedHttpAgent extends http.Agent {
  constructor(
    private target: ValidatedTarget,
    private timeoutMs: number = 10000
  ) {
    super({ keepAlive: false, maxSockets: 1, timeout: timeoutMs });
  }

  override createConnection(
    _options: http.ClientRequestArgs,
    callback?: (err: Error | null, stream: net.Socket) => void
  ): net.Socket {
    let called = false;
    const onConnectTimeout = () => {
      if (!socket.destroyed) {
        socket.destroy(
          new Error(`Socket timeout (${this.timeoutMs}ms) connecting to ${this.target.pinnedIp}`)
        );
      }
    };

    const socket = net.connect(
      {
        host: this.target.pinnedIp,
        port: this.target.port,
        timeout: this.timeoutMs,
      },
      () => {
        socket.removeListener("timeout", onConnectTimeout);
        if (!called && callback) {
          called = true;
          callback(null, socket);
        }
      }
    );

    socket.on("error", (err) => {
      if (!called && callback) {
        called = true;
        callback(err, socket);
      }
    });

    socket.setTimeout(this.timeoutMs, onConnectTimeout);

    return socket;
  }
}

/**
 * Custom HTTPS agent that establishes raw TCP connection directly to target.pinnedIp,
 * and performs TLS handshake using target.hostname for SNI and certificate verification.
 */
export class PinnedHttpsAgent extends https.Agent {
  constructor(
    private target: ValidatedTarget,
    private timeoutMs: number = 10000,
    ca?: string | Buffer | Array<string | Buffer>,
    rejectUnauthorized: boolean = true
  ) {
    super({
      keepAlive: false,
      maxSockets: 1,
      timeout: timeoutMs,
      servername: target.hostname,
      ca,
      rejectUnauthorized,
    });
  }

  override createConnection(
    _options: https.RequestOptions,
    callback?: (err: Error | null, stream: net.Socket) => void
  ): net.Socket {
    let called = false;
    const onRawConnectTimeout = () => {
      if (!rawSocket.destroyed) {
        rawSocket.destroy(
          new Error(`TCP socket timeout (${this.timeoutMs}ms) connecting to ${this.target.pinnedIp}`)
        );
      }
    };

    const rawSocket = net.connect({
      host: this.target.pinnedIp,
      port: this.target.port,
      timeout: this.timeoutMs,
    });

    rawSocket.on("error", (err) => {
      if (!called && callback) {
        called = true;
        callback(err, rawSocket);
      }
    });

    rawSocket.setTimeout(this.timeoutMs, onRawConnectTimeout);

    const onTlsTimeout = () => {
      if (!tlsSocket.destroyed) {
        tlsSocket.destroy(
          new Error(`TLS handshake/socket timeout (${this.timeoutMs}ms) to ${this.target.hostname}`)
        );
      }
    };

    const tlsSocket = tls.connect(
      {
        socket: rawSocket,
        servername: this.target.hostname,
        rejectUnauthorized: this.options.rejectUnauthorized !== false,
        ca: this.options.ca,
        timeout: this.timeoutMs,
      },
      () => {
        rawSocket.removeListener("timeout", onRawConnectTimeout);
        tlsSocket.removeListener("timeout", onTlsTimeout);
        if (!called && callback) {
          called = true;
          callback(null, tlsSocket);
        }
      }
    );

    tlsSocket.on("error", (err) => {
      if (!called && callback) {
        called = true;
        callback(err, tlsSocket);
      }
    });

    tlsSocket.setTimeout(this.timeoutMs, onTlsTimeout);

    return tlsSocket;
  }
}

export function createPinnedHttpAgent(
  target: ValidatedTarget,
  options: { timeoutMs?: number } = {}
): http.Agent {
  return new PinnedHttpAgent(target, options.timeoutMs ?? 10000);
}

export function createPinnedHttpsAgent(
  target: ValidatedTarget,
  options: {
    timeoutMs?: number;
    ca?: string | Buffer | Array<string | Buffer>;
    rejectUnauthorized?: boolean;
  } = {}
): https.Agent {
  return new PinnedHttpsAgent(
    target,
    options.timeoutMs ?? 10000,
    options.ca,
    options.rejectUnauthorized !== false
  );
}
