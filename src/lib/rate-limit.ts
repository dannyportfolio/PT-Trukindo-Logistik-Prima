/**
 * In-Memory Sliding Window Rate Limiter
 * Provides brute-force attack mitigation for sensitive endpoints (e.g. POST /api/auth/session).
 * In distributed production deployments, this serves as defense-in-depth alongside
 * edge/reverse proxy rate limiting (Cloudflare, Nginx limit_req, or AWS WAF).
 */

interface RateLimitRecord {
  attempts: number[];
  blockedUntil?: number;
}

class MemoryRateLimiter {
  private store = new Map<string, RateLimitRecord>();

  /**
   * Cleans up expired entries periodically to prevent memory leaks.
   */
  private cleanup(now: number, windowMs: number) {
    if (this.store.size > 1000) {
      for (const [key, record] of this.store.entries()) {
        const hasRecent = record.attempts.some((ts) => now - ts < windowMs);
        const isBlocked = record.blockedUntil && record.blockedUntil > now;
        if (!hasRecent && !isBlocked) {
          this.store.delete(key);
        }
      }
    }
  }

  /**
   * Checks if a client is currently rate limited.
   */
  check(
    key: string,
    maxAttempts: number = 5,
    windowMs: number = 15 * 60 * 1000, // 15 minutes
    blockDurationMs: number = 15 * 60 * 1000 // 15 minutes lock if exceeded
  ): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
    const now = Date.now();
    this.cleanup(now, windowMs);

    const record = this.store.get(key);
    if (!record) {
      return { allowed: true, remainingAttempts: maxAttempts };
    }

    // Check if under active block
    if (record.blockedUntil && record.blockedUntil > now) {
      const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
    }

    // Filter attempts within the sliding window
    const recentAttempts = record.attempts.filter((ts) => now - ts < windowMs);
    record.attempts = recentAttempts;

    if (recentAttempts.length >= maxAttempts) {
      record.blockedUntil = now + blockDurationMs;
      const retryAfterSeconds = Math.ceil(blockDurationMs / 1000);
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
    }

    return {
      allowed: true,
      remainingAttempts: maxAttempts - recentAttempts.length,
    };
  }

  /**
   * Records a failed attempt for the specified key.
   */
  recordFailure(
    key: string,
    maxAttempts: number = 5,
    windowMs: number = 15 * 60 * 1000,
    blockDurationMs: number = 15 * 60 * 1000
  ): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
    const now = Date.now();
    let record = this.store.get(key);

    if (!record) {
      record = { attempts: [] };
      this.store.set(key, record);
    }

    record.attempts.push(now);
    return this.check(key, maxAttempts, windowMs, blockDurationMs);
  }

  /**
   * Consumes one attempt in the sliding window and returns whether the action is permitted.
   */
  consume(
    key: string,
    maxAttempts: number = 5,
    windowMs: number = 60 * 60 * 1000 // 1 hour
  ): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
    const now = Date.now();
    this.cleanup(now, windowMs);

    let record = this.store.get(key);
    if (!record) {
      record = { attempts: [] };
      this.store.set(key, record);
    }

    // Check if under active block
    if (record.blockedUntil && record.blockedUntil > now) {
      const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
    }

    // Filter attempts within sliding window
    record.attempts = record.attempts.filter((ts) => now - ts < windowMs);

    if (record.attempts.length >= maxAttempts) {
      const oldestAttempt = record.attempts[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestAttempt + windowMs - now) / 1000));
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
    }

    record.attempts.push(now);
    return {
      allowed: true,
      remainingAttempts: maxAttempts - record.attempts.length,
    };
  }

  /**
   * Resets rate limit counter upon successful authentication.
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clears entire store (useful in test teardown).
   */
  clear(): void {
    this.store.clear();
  }
}

export const loginRateLimiter = new MemoryRateLimiter();
export const inquiryRateLimiter = new MemoryRateLimiter();

/**
 * Extracts a client identifier from request headers (IP or fallback).
 */
export function getClientIdentifier(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "default_client";
}
