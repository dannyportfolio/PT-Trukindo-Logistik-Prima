import crypto from "crypto";

const KEY_LENGTH = 32;

/**
 * Hashes a plaintext password using Node.js built-in scrypt with a cryptographically secure random salt.
 * Format: scrypt$<saltHex>$<derivedKeyHex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");

  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt}$${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Verifies a plaintext password against a stored scrypt hash using timingSafeEqual to prevent timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || typeof password !== "string" || !storedHash || typeof storedHash !== "string") {
    return false;
  }

  if (!storedHash.startsWith("scrypt$")) {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 3) {
    return false;
  }

  const [, salt, expectedKeyHex] = parts;

  // Salt must be exactly 32 hex characters (16 bytes)
  if (!/^[0-9a-fA-F]{32}$/.test(salt)) {
    return false;
  }

  // Expected derived key must be exactly 64 hex characters (32 bytes = KEY_LENGTH)
  if (!/^[0-9a-fA-F]{64}$/.test(expectedKeyHex)) {
    return false;
  }

  const expectedKey = Buffer.from(expectedKeyHex, "hex");
  if (expectedKey.length !== KEY_LENGTH) {
    return false;
  }

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return resolve(false);

      if (derivedKey.length !== expectedKey.length) {
        return resolve(false);
      }

      const match = crypto.timingSafeEqual(derivedKey, expectedKey);
      resolve(match);
    });
  });
}
