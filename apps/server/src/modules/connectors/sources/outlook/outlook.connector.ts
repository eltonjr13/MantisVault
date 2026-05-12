import { randomUUID } from "node:crypto";
import type { ConnectorsRepository } from "../../connectors.repository";
import { ConnectorError } from "../../connectors.errors";
import type { ConnectorRecord, SyncOptions, SyncResult, VaultConnector } from "../../connectors.types";
import { ConnectorCredentialsService } from "../../credentials/connector-credentials.service";
import { OutlookOAuthService } from "./outlook.oauth";

export class OutlookConnector implements VaultConnector {
  readonly type = "outlook" as const;

  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly credentials: ConnectorCredentialsService,
    readonly oauth: OutlookOAuthService
  ) {}

  startOAuth(): { authUrl: string } {
    return { authUrl: this.oauth.start().authUrl };
  }

  async completeOAuth(code: string | undefined, state: string | undefined): Promise<ConnectorRecord> {
    if (!code) {
      throw new ConnectorError("OUTLOOK_CODE_MISSING", "Codigo OAuth ausente.", 400);
    }

    this.oauth.validateState(state);
    const connector = this.repository.createConnector({
      id: randomUUID(),
      type: this.type,
      name: "Outlook",
      status: "connected",
      createdAt: new Date().toISOString()
    });
    await this.credentials.save(connector.id, {
      authorizationCodeReceived: true,
      todo: "Trocar code por token Microsoft Graph em implementacao completa."
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
      warnings: [],
      errors: ["Outlook sync ainda nao implementado neste MVP."]
    };
  }

  async disconnect(connectorId: string): Promise<void> {
    await this.credentials.delete(connectorId);
    this.repository.updateConnector(connectorId, { status: "disconnected", syncCursor: null });
  }
}
