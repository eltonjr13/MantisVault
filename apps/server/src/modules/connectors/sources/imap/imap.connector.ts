import { randomUUID } from "node:crypto";
import type { ConnectorsRepository } from "../../connectors.repository";
import { ConnectorError } from "../../connectors.errors";
import type { ConnectorRecord, SyncOptions, SyncResult, VaultConnector } from "../../connectors.types";
import { ConnectorCredentialsService } from "../../credentials/connector-credentials.service";
import type { ImapConnectRequest } from "./imap.types";

export class ImapConnector implements VaultConnector {
  readonly type = "imap" as const;

  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly credentials: ConnectorCredentialsService
  ) {}

  async connect(input?: unknown): Promise<ConnectorRecord> {
    const body = input as ImapConnectRequest;

    if (!body?.host || !Number.isInteger(body.port) || !body.email || !body.appPassword) {
      throw new ConnectorError("INVALID_IMAP_CONFIG", "Configuracao IMAP invalida.", 400);
    }

    if (body.port !== 993 && body.secure !== true) {
      throw new ConnectorError("INSECURE_IMAP_CONFIG", "Use IMAP seguro, preferencialmente porta 993 com senha de app.", 400);
    }

    const connector = this.repository.createConnector({
      id: randomUUID(),
      type: this.type,
      name: "IMAP",
      accountIdentifier: body.email,
      status: "connected",
      createdAt: new Date().toISOString()
    });
    await this.credentials.save(connector.id, {
      host: body.host,
      port: body.port,
      secure: body.secure,
      email: body.email,
      appPassword: body.appPassword
    });
    return this.repository.findConnector(connector.id)!;
  }

  async sync(connector: ConnectorRecord, _options: SyncOptions): Promise<SyncResult> {
    return {
      connectorId: connector.id,
      jobId: randomUUID(),
      status: "failed",
      scanned: 0,
      imported: 0,
      skipped: 0,
      failed: 1,
      bytesImported: 0,
      warnings: ["Use senha de app quando o provedor oferecer."],
      errors: ["IMAP sync ainda nao implementado neste MVP."]
    };
  }

  async disconnect(connectorId: string): Promise<void> {
    await this.credentials.delete(connectorId);
    this.repository.updateConnector(connectorId, { status: "disconnected", syncCursor: null });
  }
}
