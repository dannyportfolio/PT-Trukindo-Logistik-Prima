import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("Password Security & Hashing (scrypt)", () => {
  it("should hash a password with random salt and return standard format (scrypt$salt$derivedKey)", async () => {
    const rawPassword = "SecureOperatorPassword123!";
    const hash = await hashPassword(rawPassword);

    expect(typeof hash).toBe("string");
    expect(hash.startsWith("scrypt$")).toBe(true);

    const parts = hash.split("$");
    expect(parts.length).toBe(3);

    const [, saltHex, derivedHex] = parts;
    // 16 bytes = 32 hex chars
    expect(saltHex.length).toBe(32);
    // 32 bytes = 64 hex chars
    expect(derivedHex.length).toBe(64);
    // Should only contain hex characters
    expect(/^[0-9a-f]+$/i.test(saltHex)).toBe(true);
    expect(/^[0-9a-f]+$/i.test(derivedHex)).toBe(true);
  });

  it("should produce different hashes for identical passwords due to cryptographic salting", async () => {
    const password = "SamePasswordAcrossUsers!";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toBe(hash2);

    const [, salt1] = hash1.split("$");
    const [, salt2] = hash2.split("$");
    expect(salt1).not.toBe(salt2);
  });

  it("should successfully verify the correct password", async () => {
    const password = "AstraOps$2026$Production";
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword(password, hash);
    expect(isMatch).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const password = "CorrectPassword123";
    const wrongPassword = "WrongPassword456";
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword(wrongPassword, hash);
    expect(isMatch).toBe(false);
  });

  it("should reject verification when empty or whitespace passwords are tested against a non-empty password hash", async () => {
    const hash = await hashPassword("ValidPassword");

    expect(await verifyPassword("", hash)).toBe(false);
    expect(await verifyPassword("   ", hash)).toBe(false);
  });

  it("should safely handle and reject malformed hashes without throwing unhandled exceptions", async () => {
    const password = "TestPassword";

    // Missing prefix
    expect(await verifyPassword(password, "invalidsaltandkeywithoutprefix")).toBe(false);

    // Empty string
    expect(await verifyPassword(password, "")).toBe(false);

    // Too few dollar parts
    expect(await verifyPassword(password, "scrypt$saltonly")).toBe(false);

    // Too many dollar parts
    expect(await verifyPassword(password, "scrypt$salt$key$extrapart")).toBe(false);

    // Non-hex characters
    expect(await verifyPassword(password, "scrypt$zzzzzzzz$yyyyyy")).toBe(false);
  });
});
