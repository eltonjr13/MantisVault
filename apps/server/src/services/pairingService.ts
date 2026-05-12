import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { PairPayload } from "@kazvault/shared";
import type { ServerConfig } from "../config/config";
import type { StorageService } from "./storageService";
import { getLocalIpAddress, getServerName } from "../utils/network";

interface ActivePairing {
  token: string;
  expiresAtMs: number;
  confirmedAt?: string;
  confirmedBy?: string;
}

export class PairingService {
  private activePairing?: ActivePairing;
  private readonly confirmedSessions = new Map<string, { confirmedAt: string; confirmedBy: string }>();
  private readonly serverIdPath: string;

  constructor(
    private readonly config: ServerConfig,
    private readonly storage: StorageService
  ) {
    this.serverIdPath = `${this.storage.metaDir}/server-id`;
  }

  startPairing(): PairPayload {
    const token = randomBytes(32).toString("base64url");
    const expiresAtMs = Date.now() + this.config.pairTokenTtlSeconds * 1000;
    this.activePairing = { token, expiresAtMs };

    return this.createPayload(token, expiresAtMs);
  }

  getPayload(): PairPayload {
    if (!this.activePairing || this.activePairing.expiresAtMs <= Date.now()) {
      return this.startPairing();
    }

    return this.createPayload(this.activePairing.token, this.activePairing.expiresAtMs);
  }

  verify(token: string | undefined): boolean {
    if (!token || !this.activePairing) {
      return false;
    }

    if (this.confirmedSessions.has(token)) {
      return true;
    }

    return this.activePairing.token === token && this.activePairing.expiresAtMs > Date.now();
  }

  confirm(token: string | undefined, confirmedBy: string): boolean {
    if (!this.verify(token)) {
      return false;
    }

    const confirmedAt = new Date().toISOString();

    this.activePairing = {
      ...this.activePairing!,
      confirmedAt,
      confirmedBy
    };
    this.confirmedSessions.set(token!, { confirmedAt, confirmedBy });

    return true;
  }

  getStatus(token: string | undefined): {
    active: boolean;
    confirmed: boolean;
    confirmedAt?: string;
    confirmedBy?: string;
    expiresAt?: string;
  } {
    if (!token) {
      return {
        active: false,
        confirmed: false
      };
    }

    const confirmedSession = this.confirmedSessions.get(token);

    if (confirmedSession) {
      return {
        active: true,
        confirmed: true,
        confirmedAt: confirmedSession.confirmedAt,
        confirmedBy: confirmedSession.confirmedBy
      };
    }

    if (!this.activePairing || this.activePairing.token !== token) {
      return {
        active: false,
        confirmed: false
      };
    }

    const active = this.activePairing.expiresAtMs > Date.now();

    return {
      active,
      confirmed: Boolean(this.activePairing.confirmedAt),
      confirmedAt: this.activePairing.confirmedAt,
      confirmedBy: this.activePairing.confirmedBy,
      expiresAt: new Date(this.activePairing.expiresAtMs).toISOString()
    };
  }

  private createPayload(token: string, expiresAtMs: number): PairPayload {
    const ip = getLocalIpAddress();

    return {
      app: "KazVault",
      version: 1,
      serverName: getServerName(),
      baseUrl: `http://${ip}:${this.config.port}`,
      token,
      expiresAt: new Date(expiresAtMs).toISOString(),
      fingerprint: this.getFingerprint()
    };
  }

  private getFingerprint(): string {
    const serverId = this.getOrCreateServerId();
    const hash = createHash("sha256").update(serverId).digest("hex").toUpperCase();
    return hash.match(/.{1,4}/g)?.join("-") ?? hash;
  }

  private getOrCreateServerId(): string {
    if (existsSync(this.serverIdPath)) {
      return readFileSync(this.serverIdPath, "utf8").trim();
    }

    const serverId = randomUUID();
    writeFileSync(this.serverIdPath, serverId, "utf8");
    return serverId;
  }
}
