import crypto from "crypto";
import { Pool } from "pg";
import { getPool } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { UserRole } from "./auth";

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  mfa_secret: string | null;
  mfa_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  last_seen_at: Date;
  ip_address: string | null;
  user_agent: string | null;
}

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  mfa_enabled: boolean;
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export class UserRepository {
  constructor(private pool: Pool = getPool()) {}

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const res = await this.pool.query<User>(
      "SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1;",
      [normalized]
    );
    return res.rows[0] || null;
  }

  async findById(id: string): Promise<User | null> {
    const res = await this.pool.query<User>(
      "SELECT * FROM users WHERE id = $1 LIMIT 1;",
      [id]
    );
    return res.rows[0] || null;
  }

  async createUser(params: {
    email: string;
    name: string;
    password: string;
    role: UserRole;
  }): Promise<SafeUser> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const passwordHash = await hashPassword(params.password);

    const res = await this.pool.query<User>(
      `INSERT INTO users (email, name, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, name, role, is_active, mfa_enabled;`,
      [normalizedEmail, params.name.trim(), passwordHash, params.role]
    );

    const user = res.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      mfa_enabled: user.mfa_enabled,
    };
  }

  async authenticateCredentials(params: {
    email: string;
    password: string;
  }): Promise<{ success: true; user: SafeUser } | { success: false; reason: string }> {
    const user = await this.findByEmail(params.email);
    if (!user) {
      return { success: false, reason: "Invalid email or password." };
    }

    if (!user.is_active) {
      return { success: false, reason: "Account is inactive. Please contact an administrator." };
    }

    const isValid = await verifyPassword(params.password, user.password_hash);
    if (!isValid) {
      return { success: false, reason: "Invalid email or password." };
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
        mfa_enabled: user.mfa_enabled,
      },
    };
  }

  async createSession(params: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    durationHours?: number;
  }): Promise<{ token: string; session: UserSession }> {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const hours = params.durationHours || 8;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const res = await this.pool.query<UserSession>(
      `INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [params.userId, tokenHash, expiresAt, params.ipAddress || null, params.userAgent || null]
    );

    return {
      token: rawToken,
      session: res.rows[0],
    };
  }

  async validateSession(rawToken: string): Promise<
    | { valid: true; user: SafeUser; session: UserSession }
    | { valid: false; reason: string }
  > {
    const tokenHash = hashToken(rawToken);

    const query = `
      SELECT
        s.id AS session_id,
        s.user_id,
        s.token_hash,
        s.expires_at,
        s.created_at AS session_created_at,
        s.last_seen_at,
        s.ip_address,
        s.user_agent,
        u.id AS u_id,
        u.email,
        u.name,
        u.role,
        u.is_active,
        u.mfa_enabled
      FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token_hash = $1
      LIMIT 1;
    `;

    const res = await this.pool.query(query, [tokenHash]);
    if (res.rows.length === 0) {
      return { valid: false, reason: "Session not found." };
    }

    const row = res.rows[0];
    const now = new Date();
    if (new Date(row.expires_at) <= now) {
      return { valid: false, reason: "Session has expired." };
    }

    if (!row.is_active) {
      return { valid: false, reason: "User account is disabled." };
    }

    // Touch last_seen_at asynchronously
    this.pool.query("UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1;", [row.session_id]).catch(() => {});

    return {
      valid: true,
      user: {
        id: row.u_id,
        email: row.email,
        name: row.name,
        role: row.role as UserRole,
        is_active: row.is_active,
        mfa_enabled: row.mfa_enabled,
      },
      session: {
        id: row.session_id,
        user_id: row.user_id,
        token_hash: row.token_hash,
        expires_at: row.expires_at,
        created_at: row.session_created_at,
        last_seen_at: row.last_seen_at,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
      },
    };
  }

  async revokeSession(rawToken: string): Promise<boolean> {
    const tokenHash = hashToken(rawToken);
    const res = await this.pool.query("DELETE FROM user_sessions WHERE token_hash = $1;", [tokenHash]);
    return (res.rowCount ?? 0) > 0;
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    const res = await this.pool.query("DELETE FROM user_sessions WHERE user_id = $1;", [userId]);
    return res.rowCount ?? 0;
  }
}
