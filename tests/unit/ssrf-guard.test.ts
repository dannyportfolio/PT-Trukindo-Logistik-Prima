import { describe, it, expect, vi } from "vitest";
import {
  isIpProhibited,
  validateUrl,
  validateAndPinTarget,
  createPinnedHttpAgent,
  createPinnedHttpsAgent,
  PinnedHttpAgent,
  PinnedHttpsAgent,
  SsrfError,
  InvalidUrlError,
  ProhibitedSchemeError,
  ProhibitedPortError,
  UserInfoNotAllowedError,
  DnsResolutionError,
  ProhibitedIpError,
  DnsLookupFn,
  ValidatedTarget,
} from "@/lib/agent/tools/ssrf-guard";

describe("SSRF Guard & IP Pinning Unit Suite", () => {
  describe("1. Multi-Stack IP & CIDR Blacklist (isIpProhibited)", () => {
    describe("IPv4 Blacklist Enforcement", () => {
      const forbiddenIpv4 = [
        // Loopback (127.0.0.0/8)
        ["127.0.0.1", "IPv4 loopback"],
        ["127.0.0.2", "IPv4 loopback"],
        ["127.255.255.254", "IPv4 loopback"],
        // Private Subnets (RFC 1918)
        ["10.0.0.1", "RFC 1918 private"],
        ["10.255.255.254", "RFC 1918 private"],
        ["172.16.0.1", "RFC 1918 private"],
        ["172.31.255.254", "RFC 1918 private"],
        ["192.168.0.1", "RFC 1918 private"],
        ["192.168.1.254", "RFC 1918 private"],
        // Link-Local & Cloud Metadata (169.254.0.0/16)
        ["169.254.169.254", "Cloud metadata"],
        ["169.254.0.1", "IPv4 link-local"],
        ["169.254.255.254", "IPv4 link-local"],
        // Current Network / Unspecified (0.0.0.0/8)
        ["0.0.0.0", "IPv4 unspecified"],
        ["0.0.0.1", "IPv4 current network"],
        // Broadcast (255.255.255.255)
        ["255.255.255.255", "IPv4 broadcast"],
        // Multicast (224.0.0.0/4)
        ["224.0.0.1", "IPv4 multicast"],
        ["239.255.255.250", "IPv4 multicast"],
        // Carrier-Grade NAT (100.64.0.0/10 - RFC 6598)
        ["100.64.0.1", "Carrier-Grade NAT"],
        ["100.127.255.254", "Carrier-Grade NAT"],
        // Reserved / Test Networks (RFC 5737 & RFC 2544)
        ["192.0.2.1", "TEST-NET-1"],
        ["198.51.100.1", "TEST-NET-2"],
        ["203.0.113.1", "TEST-NET-3"],
        ["198.18.0.1", "Benchmarking"],
        ["240.0.0.1", "Reserved"],
      ];

      it.each(forbiddenIpv4)("should prohibit forbidden IPv4 %s (%s)", (ip) => {
        const result = isIpProhibited(ip);
        expect(result.prohibited).toBe(true);
        expect(result.reason).toBeDefined();
      });

      const allowedIpv4 = [
        "8.8.8.8",
        "1.1.1.1",
        "93.184.216.34",
        "142.250.190.46",
        "151.101.1.140",
      ];

      it.each(allowedIpv4)("should permit public global unicast IPv4 %s", (ip) => {
        const result = isIpProhibited(ip);
        expect(result.prohibited).toBe(false);
      });
    });

    describe("IPv6 Blacklist Enforcement & IANA Special-Purpose Policy", () => {
      const forbiddenIpv6 = [
        // Loopback (::1/128)
        ["::1", "IPv6 loopback"],
        // Unspecified (::/128)
        ["::", "IPv6 unspecified"],
        // Link-Local (fe80::/10)
        ["fe80::1", "IPv6 link-local"],
        ["fe80::c001:1dff:fee0:0", "IPv6 link-local"],
        // Unique Local / Private (fc00::/7 - RFC 4193)
        ["fc00::1", "RFC 4193 unique local"],
        ["fd00::1", "RFC 4193 unique local"],
        ["fd12:3456:789a:1::1", "RFC 4193 unique local"],
        // Multicast (ff00::/8)
        ["ff02::1", "IPv6 multicast"],
        ["ff05::1:3", "IPv6 multicast"],
        // Documentation prefixes (2001:db8::/32 & 3fff::/20)
        ["2001:db8::1", "IPv6 documentation (RFC 3849)"],
        ["2001:db8:85a3::8a2e:370:7334", "IPv6 documentation (RFC 3849)"],
        ["3fff::1", "IPv6 documentation (RFC 9637)"],
        // 6to4 Transition prefix (2002::/16 - RFC 3056)
        ["2002::1", "6to4 transition"],
        ["2002:c000:0201::1", "6to4 transition"],
        // Direct Delegation AS112 Service (2620:4f:8000::/48 - RFC 7534)
        ["2620:4f:8000::1", "AS112 service"],
        // IPv4/IPv6 Translation (NAT64 - RFC 6052 & RFC 8215)
        ["64:ff9b::1", "NAT64 Well-Known (RFC 6052)"],
        ["64:ff9b:1::1", "NAT64 Local-Use (RFC 8215)"],
        // Discard-Only prefix (100::/64 - RFC 6666)
        ["100::1", "Discard-only"],
        // IETF Protocol Assignments (2001::/23 - RFC 2928)
        ["2001:0000::1", "IETF Protocol Assignment (start of 2001::/23)"],
        ["2001:01ff:ffff:ffff:ffff:ffff:ffff:ffff", "IETF Protocol Assignment (end of 2001::/23)"],
        ["2001::1", "TEREDO transition (RFC 4380)"],
        ["2001:1::1", "PCP Anycast (RFC 7723)"],
        ["2001:1::2", "TURN Anycast (RFC 8155)"],
        ["2001:2:0:1::1", "IPv6 benchmarking (RFC 5180)"],
        ["2001:3::1", "AMT (RFC 7450)"],
        ["2001:4:112::1", "AS112-v6 (RFC 7535)"],
        ["2001:5::1", "MTI (RFC 9637)"],
        ["2001:10::1", "ORCHID (RFC 4843)"],
        ["2001:20::1", "ORCHIDv2 (RFC 7343)"],
        ["2001:30::1", "Drone Remote ID (RFC 9374)"],
        // Non-global unicast outside 2000::/3
        ["::2", "IPv6 address outside 2000::/3"],
        ["4000::1", "IPv6 address outside 2000::/3"],
        ["0042::1", "IPv6 address outside 2000::/3"],
      ];

      it.each(forbiddenIpv6)("should prohibit forbidden IPv6 %s (%s)", (ip) => {
        const result = isIpProhibited(ip);
        expect(result.prohibited).toBe(true);
        expect(result.reason).toBeDefined();
      });

      const allowedIpv6 = [
        "2606:2800:220:1:248:1893:25c8:1946", // example.com
        "2001:4860:4860::8888",               // Google DNS (Global Unicast in 2001::, but outside 2001::/23)
        "2606:4700:4700::1111",               // Cloudflare DNS
        "2a00:1450:4009:820::200e",           // Google Web
        "2600:9000:21a0:ac00:1b:2893:53c0:93a1", // AWS CloudFront
      ];

      it.each(allowedIpv6)("should permit global unicast IPv6 %s", (ip) => {
        const result = isIpProhibited(ip);
        expect(result.prohibited).toBe(false);
      });
    });

    describe("IPv4-Mapped IPv6 & Evasion Techniques", () => {
      const evasionIps = [
        // Mapped loopback
        ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
        ["::ffff:127.0.0.2", "IPv4-mapped loopback"],
        // Mapped cloud metadata
        ["::ffff:169.254.169.254", "IPv4-mapped cloud metadata"],
        // Mapped RFC 1918
        ["::ffff:10.0.0.1", "IPv4-mapped private 10.0.0.0/8"],
        ["::ffff:172.16.0.1", "IPv4-mapped private 172.16.0.0/12"],
        ["::ffff:192.168.1.1", "IPv4-mapped private 192.168.0.0/16"],
        // Mapped broadcast and 0.0.0.0
        ["::ffff:0.0.0.0", "IPv4-mapped 0.0.0.0"],
        ["::ffff:255.255.255.255", "IPv4-mapped broadcast"],
      ];

      it.each(evasionIps)(
        "should unmap and prohibit IPv4-mapped address %s (%s)",
        (ip) => {
          const result = isIpProhibited(ip);
          expect(result.prohibited).toBe(true);
          expect(result.reason).toBeDefined();
        }
      );

      it("should permit IPv4-mapped IPv6 of a valid public unicast address", () => {
        const result = isIpProhibited("::ffff:8.8.8.8");
        expect(result.prohibited).toBe(false);
      });

      it("should reject malformed or invalid IP strings", () => {
        expect(isIpProhibited("not-an-ip").prohibited).toBe(true);
        expect(isIpProhibited("999.999.999.999").prohibited).toBe(true);
        expect(isIpProhibited("").prohibited).toBe(true);
      });
    });
  });

  describe("2. URL Validation & Protocol/Port Restrictions (validateUrl)", () => {
    it("should accept valid HTTP and HTTPS URLs on default ports", () => {
      const url1 = validateUrl("https://example.com");
      expect(url1.protocol).toBe("https:");
      expect(url1.hostname).toBe("example.com");

      const url2 = validateUrl("http://example.com/company/about?lang=en");
      expect(url2.protocol).toBe("http:");
      expect(url2.pathname).toBe("/company/about");
      expect(url2.search).toBe("?lang=en");

      const url3 = validateUrl("https://example.com:443/prospect");
      expect(url3.port).toBe(""); // WHATWG URL standard normalizes default scheme port to empty string

      const url4 = validateUrl("http://example.com:80/prospect");
      expect(url4.port).toBe("");
    });

    it("should reject non-HTTP/HTTPS schemes", () => {
      expect(() => validateUrl("file:///etc/passwd")).toThrow(ProhibitedSchemeError);
      expect(() => validateUrl("ftp://files.example.com")).toThrow(ProhibitedSchemeError);
      expect(() => validateUrl("gopher://gopher.example.com")).toThrow(ProhibitedSchemeError);
      expect(() => validateUrl("javascript:alert(1)")).toThrow(ProhibitedSchemeError);
      expect(() => validateUrl("data:text/html,<h1>Hello</h1>")).toThrow(ProhibitedSchemeError);
    });

    it("should reject non-standard destination ports by default", () => {
      expect(() => validateUrl("http://example.com:8080")).toThrow(ProhibitedPortError);
      expect(() => validateUrl("https://example.com:8443")).toThrow(ProhibitedPortError);
      expect(() => validateUrl("http://example.com:22")).toThrow(ProhibitedPortError);
      expect(() => validateUrl("http://example.com:6379")).toThrow(ProhibitedPortError);
      expect(() => validateUrl("http://example.com:5432")).toThrow(ProhibitedPortError);
    });

    it("should allow custom ports only when allowCustomPortsForTesting is explicitly true", () => {
      const url = validateUrl("http://127.0.0.1:3000", { allowCustomPortsForTesting: true });
      expect(url.port).toBe("3000");
    });

    it("should reject URLs with embedded user credentials (userinfo)", () => {
      expect(() => validateUrl("https://admin:secret@example.com")).toThrow(
        UserInfoNotAllowedError
      );
      expect(() => validateUrl("http://user@example.com")).toThrow(
        UserInfoNotAllowedError
      );
      expect(() => validateUrl("https://:password@example.com")).toThrow(
        UserInfoNotAllowedError
      );
    });

    it("should reject empty or malformed URLs", () => {
      expect(() => validateUrl("")).toThrow(InvalidUrlError);
      expect(() => validateUrl("   ")).toThrow(InvalidUrlError);
      expect(() => validateUrl("http://")).toThrow(InvalidUrlError);
      expect(() => validateUrl("not a valid url")).toThrow(InvalidUrlError);
    });
  });

  describe("3. Pre-Request DNS Resolution & Target Pinning (validateAndPinTarget)", () => {
    it("should resolve and pin safe public IPv4 address", async () => {
      const mockDns: DnsLookupFn = vi.fn().mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);

      const target = await validateAndPinTarget("https://example.com/about", {
        dnsLookupFn: mockDns,
      });

      expect(target.hostname).toBe("example.com");
      expect(target.protocol).toBe("https:");
      expect(target.port).toBe(443);
      expect(target.pinnedIp).toBe("93.184.216.34");
      expect(target.isIpv6).toBe(false);
      expect(target.resolvedIps).toEqual(["93.184.216.34"]);
      expect(mockDns).toHaveBeenCalledWith("example.com", { all: true });
    });

    it("should reject domain resolving to private IPv4 address", async () => {
      const mockDns: DnsLookupFn = vi.fn().mockResolvedValue([
        { address: "10.0.0.5", family: 4 },
      ]);

      await expect(
        validateAndPinTarget("http://internal-portal.corp", { dnsLookupFn: mockDns })
      ).rejects.toThrow(ProhibitedIpError);
    });

    it("should reject domain resolving to cloud metadata IP (169.254.169.254)", async () => {
      const mockDns: DnsLookupFn = vi.fn().mockResolvedValue([
        { address: "169.254.169.254", family: 4 },
      ]);

      await expect(
        validateAndPinTarget("http://metadata.attacker.com", { dnsLookupFn: mockDns })
      ).rejects.toThrow(ProhibitedIpError);
    });

    it("should reject domain resolving to IPv6 loopback (::1)", async () => {
      const mockDns: DnsLookupFn = vi.fn().mockResolvedValue([
        { address: "::1", family: 6 },
      ]);

      await expect(
        validateAndPinTarget("https://local-ipv6.attacker.com", { dnsLookupFn: mockDns })
      ).rejects.toThrow(ProhibitedIpError);
    });

    it("should reject domain if ANY resolved IP in a dual-stack/multi-IP set is prohibited", async () => {
      // Attacker returns safe public IP as first record, but internal IP as second record
      const mockDns: DnsLookupFn = vi.fn().mockResolvedValue([
        { address: "93.184.216.34", family: 4 }, // public
        { address: "192.168.1.100", family: 4 }, // private!
      ]);

      await expect(
        validateAndPinTarget("https://split-dns.attacker.com", { dnsLookupFn: mockDns })
      ).rejects.toThrow(ProhibitedIpError);
    });

    it("should reject domain resolving to 0 IP addresses", async () => {
      const mockDns: DnsLookupFn = vi.fn().mockResolvedValue([]);

      await expect(
        validateAndPinTarget("https://non-existent-domain.xyz", { dnsLookupFn: mockDns })
      ).rejects.toThrow(DnsResolutionError);
    });

    it("should throw DnsResolutionError when DNS lookup encounters network failure", async () => {
      const mockDns: DnsLookupFn = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));

      await expect(
        validateAndPinTarget("https://failing-domain.xyz", { dnsLookupFn: mockDns })
      ).rejects.toThrow(DnsResolutionError);
    });

    it("should directly validate and pin IP literal without calling DNS lookup", async () => {
      const mockDns: DnsLookupFn = vi.fn();

      const target = await validateAndPinTarget("http://8.8.8.8/test", {
        dnsLookupFn: mockDns,
      });

      expect(mockDns).not.toHaveBeenCalled();
      expect(target.pinnedIp).toBe("8.8.8.8");
      expect(target.hostname).toBe("8.8.8.8");
    });

    it("should reject forbidden IP literal directly", async () => {
      await expect(validateAndPinTarget("http://127.0.0.1")).rejects.toThrow(
        ProhibitedIpError
      );
      await expect(validateAndPinTarget("http://169.254.169.254")).rejects.toThrow(
        ProhibitedIpError
      );
      await expect(validateAndPinTarget("http://[::1]")).rejects.toThrow(
        ProhibitedIpError
      );
    });
  });

  describe("4. Socket IP Pinning Agents (PinnedHttpAgent & PinnedHttpsAgent)", () => {
    it("should create PinnedHttpAgent with pinned IP and socket options", () => {
      const target: ValidatedTarget = {
        originalUrl: "http://example.com/page",
        parsedUrl: new URL("http://example.com/page"),
        hostname: "example.com",
        port: 80,
        protocol: "http:",
        pinnedIp: "93.184.216.34",
        isIpv6: false,
        resolvedIps: ["93.184.216.34"],
      };

      const agent = createPinnedHttpAgent(target, { timeoutMs: 5000 });
      expect(agent).toBeInstanceOf(PinnedHttpAgent);
      expect(typeof agent.createConnection).toBe("function");
    });

    it("should create PinnedHttpsAgent configured with target hostname for SNI and strict TLS verification", () => {
      const target: ValidatedTarget = {
        originalUrl: "https://secure.example.com",
        parsedUrl: new URL("https://secure.example.com"),
        hostname: "secure.example.com",
        port: 443,
        protocol: "https:",
        pinnedIp: "93.184.216.34",
        isIpv6: false,
        resolvedIps: ["93.184.216.34"],
      };

      const agent = createPinnedHttpsAgent(target, {
        timeoutMs: 8000,
        rejectUnauthorized: true,
      });

      expect(agent).toBeInstanceOf(PinnedHttpsAgent);
      expect(agent.options.servername).toBe("secure.example.com");
      expect(agent.options.rejectUnauthorized).toBe(true);
      expect(typeof agent.createConnection).toBe("function");
    });

    it("should prevent DNS rebinding by pinning the initially validated IP address", async () => {
      let lookupCount = 0;
      // Rebinding DNS: returns safe IP on first lookup, but would return AWS metadata IP on any subsequent lookup
      const rebindingDns: DnsLookupFn = vi.fn().mockImplementation(async () => {
        lookupCount++;
        if (lookupCount === 1) {
          return [{ address: "93.184.216.34", family: 4 }];
        }
        return [{ address: "169.254.169.254", family: 4 }];
      });

      const target = await validateAndPinTarget("https://rebinding-target.com/page", {
        dnsLookupFn: rebindingDns,
      });

      // Target is pinned permanently to the safe IP from first lookup
      expect(target.pinnedIp).toBe("93.184.216.34");
      expect(target.hostname).toBe("rebinding-target.com");
      expect(lookupCount).toBe(1);

      // The agent maintains connection parameters strictly with the pinned IP and target hostname
      const agent = createPinnedHttpsAgent(target);
      expect(agent.options.servername).toBe("rebinding-target.com");
      expect(target.pinnedIp).toBe("93.184.216.34");
    });
  });
});
