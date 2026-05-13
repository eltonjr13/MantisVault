import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AuthSession } from "@kazvault/shared";
import type { VaultDatabase } from "../db/database";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

interface AuthAccountRow extends Record<string, unknown> {
  id: string;
  type: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthDeviceSessionRow extends Record<string, unknown> {
  id: string;
  account_id: string;
  device_id: string;
  device_name: string;
  refresh_token_hash: string;
  refresh_token_expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AccessTokenPayload {
  typ: "access";
  sub: string;
  sid: string;
  did: string;
  iat: number;
  exp: number;
}

export interface AuthContext {
  accountId: string;
  sessionId: string;
  deviceId: string;
}

export class AuthSessionService {
  private readonly secret: Buffer;

  constructor(
    private readonly db: VaultDatabase,
    secretPath: string
  ) {
    this.secret = readOrCreateSecret(secretPath);
  }

  createAnonymousSession(input: { deviceName?: string }): AuthSession {
    const account = this.getOrCreateAnonymousAccount();
    return this.createDeviceSession(account.id, input.deviceName);
  }

  refresh(refreshToken: string | undefined): AuthSession | undefined {
    if (!refreshToken) {
      return undefined;
    }

    const now = new Date();
    const current = this.db.get<AuthDeviceSessionRow>(
      "SELECT * FROM auth_device_sessions WHERE refresh_token_hash = ?",
      [hashToken(refreshToken)]
    );

    if (!current || current.revoked_at || new Date(current.refresh_token_expires_at).getTime() <= now.getTime()) {
      return undefined;
    }

    const nextRefreshToken = createOpaqueToken();
    const refreshTokenExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
    const updatedAt = now.toISOString();

    this.db.run(
      `
        UPDATE auth_device_sessions
        SET refresh_token_hash = ?, refresh_token_expires_at = ?, last_seen_at = ?, updated_at = ?
        WHERE id = ?
      `,
      [hashToken(nextRefreshToken), refreshTokenExpiresAt, updatedAt, updatedAt, current.id]
    );

    return this.toAuthSession(
      {
        ...current,
        refresh_token_hash: hashToken(nextRefreshToken),
        refresh_token_expires_at: refreshTokenExpiresAt,
        last_seen_at: updatedAt,
        updated_at: updatedAt
      },
      nextRefreshToken
    );
  }

  revoke(refreshToken: string | undefined): boolean {
    if (!refreshToken) {
      return false;
    }

    const current = this.db.get<AuthDeviceSessionRow>(
      "SELECT * FROM auth_device_sessions WHERE refresh_token_hash = ?",
      [hashToken(refreshToken)]
    );

    if (!current || current.revoked_at) {
      return false;
    }

    const now = new Date().toISOString();
    this.db.run("UPDATE auth_device_sessions SET revoked_at = ?, updated_at = ? WHERE id = ?", [now, now, current.id]);
    return true;
  }

  verifyAccessToken(token: string | undefined): AuthContext | undefined {
    const payload = token ? this.readAccessToken(token) : undefined;

    if (!payload) {
      return undefined;
    }

    const current = this.db.get<AuthDeviceSessionRow>("SELECT * FROM auth_device_sessions WHERE id = ?", [payload.sid]);

    if (
      !current ||
      current.account_id !== payload.sub ||
      current.device_id !== payload.did ||
      current.revoked_at ||
      new Date(current.refresh_token_expires_at).getTime() <= Date.now()
    ) {
      return undefined;
    }

    const now = new Date().toISOString();
    this.db.run("UPDATE auth_device_sessions SET last_seen_at = ?, updated_at = ? WHERE id = ?", [now, now, current.id]);

    return {
      accountId: current.account_id,
      sessionId: current.id,
      deviceId: current.device_id
    };
  }

  describeSession(token: string | undefined): AuthContext | undefined {
    return this.verifyAccessToken(token);
  }

  private getOrCreateAnonymousAccount(): AuthAccountRow {
    const existing = this.db.get<AuthAccountRow>(
      "SELECT * FROM auth_accounts WHERE type = 'anonymous' ORDER BY created_at LIMIT 1"
    );

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const account: AuthAccountRow = {
      id: randomUUID(),
      type: "anonymous",
      email: null,
      created_at: now,
      updated_at: now
    };

    this.db.run(
      "INSERT INTO auth_accounts (id, type, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [account.id, account.type, account.email, account.created_at, account.updated_at]
    );

    return account;
  }

  private createDeviceSession(accountId: string, deviceName?: string): AuthSession {
    const now = new Date();
    const refreshToken = createOpaqueToken();
    const session: AuthDeviceSessionRow = {
      id: randomUUID(),
      account_id: accountId,
      device_id: randomUUID(),
      device_name: normalizeDeviceName(deviceName),
      refresh_token_hash: hashToken(refreshToken),
      refresh_token_expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
      revoked_at: null,
      last_seen_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    this.db.run(
      `
        INSERT INTO auth_device_sessions (
          id, account_id, device_id, device_name, refresh_token_hash,
          refresh_token_expires_at, revoked_at, last_seen_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        session.id,
        session.account_id,
        session.device_id,
        session.device_name,
        session.refresh_token_hash,
        session.refresh_token_expires_at,
        session.revoked_at,
        session.last_seen_at,
        session.created_at,
        session.updated_at
      ]
    );

    return this.toAuthSession(session, refreshToken);
  }

  private toAuthSession(session: AuthDeviceSessionRow, refreshToken: string): AuthSession {
    const accessTokenExpiresAtMs = Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000;

    return {
      accountId: session.account_id,
      deviceId: session.device_id,
      accessToken: this.createAccessToken({
        typ: "access",
        sub: session.account_id,
        sid: session.id,
        did: session.device_id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(accessTokenExpiresAtMs / 1000)
      }),
      accessTokenExpiresAt: new Date(accessTokenExpiresAtMs).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: session.refresh_token_expires_at,
      sessionType: "anonymous"
    };
  }

  private createAccessToken(payload: AccessTokenPayload): string {
    const header = encodeJson({ alg: "HS256", typ: "JWT" });
    const body = encodeJson(payload);
    const signature = this.sign(`${header}.${body}`);
    return `${header}.${body}.${signature}`;
  }

  private readAccessToken(token: string): AccessTokenPayload | undefined {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return undefined;
    }

    const [header, body, signature] = parts;
    const expected = this.sign(`${header}.${body}`);

    if (!safeEqual(signature, expected)) {
      return undefined;
    }

    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<AccessTokenPayload>;

      if (
        payload.typ !== "access" ||
        typeof payload.sub !== "string" ||
        typeof payload.sid !== "string" ||
        typeof payload.did !== "string" ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number" ||
        payload.exp <= Math.floor(Date.now() / 1000)
      ) {
        return undefined;
      }

      return payload as AccessTokenPayload;
    } catch {
      return undefined;
    }
  }

  private sign(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }
}

function readOrCreateSecret(secretPath: string): Buffer {
  if (existsSync(secretPath)) {
    return Buffer.from(readFileSync(secretPath, "utf8").trim(), "base64url");
  }

  mkdirSync(dirname(secretPath), { recursive: true });
  const secret = randomBytes(32);
  writeFileSync(secretPath, secret.toString("base64url"), "utf8");
  return secret;
}

function createOpaqueToken(): string {
  return randomBytes(48).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.byteLength === rightBuffer.byteLength && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeDeviceName(value: string | undefined): string {
  const name = value?.trim();
  return name ? name.slice(0, 80) : "Celular";
}
