import { randomUUID } from "node:crypto";
import type { ConnectorsRepository } from "../../connectors.repository";
import { ConnectorError } from "../../connectors.errors";
import type { ConnectorRecord, SyncOptions, SyncResult, VaultConnector } from "../../connectors.types";
import { ContactNormalizer } from "../../normalizers/contact.normalizer";
import type { VaultIngestService } from "../../../vault/ingest/vault-ingest.service";
import type { MobileContactsJsonImportRequest } from "./mobile-contacts.types";

export class MobileContactsConnector implements VaultConnector {
  readonly type = "mobile-contacts" as const;
  private readonly normalizer = new ContactNormalizer();

  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly ingest: VaultIngestService
  ) {}

  async connect(input?: unknown): Promise<ConnectorRecord> {
    const body = (input ?? {}) as { deviceId?: string };
    return this.repository.createConnector({
      id: randomUUID(),
      type: this.type,
      name: "Contatos do celular",
      accountIdentifier: body.deviceId,
      status: "connected",
      createdAt: new Date().toISOString()
    });
  }

  async importVcf(input: { file: Buffer; fileName?: string; deviceId: string }): Promise<SyncResult> {
    if (!input.deviceId || !input.file?.byteLength) {
      throw new ConnectorError("INVALID_CONTACTS_IMPORT", "VCF ou deviceId ausente.", 400);
    }

    const connector = await this.connect({ deviceId: input.deviceId });
    const contacts = this.normalizer.parseVcf(input.file);
    const sourceId = `contacts-vcf:${input.deviceId}:${Date.now()}`;
    const result = await this.ingest.ingest({
      connectorId: connector.id,
      sourceId,
      sourceType: "contact",
      fileName: input.fileName ?? "contacts.vcf",
      mimeType: "text/vcard",
      buffer: input.file,
      metadata: { deviceId: input.deviceId, contactCount: contacts.length }
    });

    for (const contact of contacts) {
      this.repository.createItem({
        id: randomUUID(),
        connectorId: connector.id,
        sourceId: `${sourceId}:${contact.sourceId}`,
        sourceType: "contact",
        title: contact.title,
        mimeType: "text/vcard",
        originalSize: result.originalSize,
        originalHash: result.originalHash,
        storedFileId: result.storedFileId,
        manifestId: result.manifestId,
        importedAt: new Date().toISOString(),
        metadata: contact.metadata
      });
    }

    return resultToSync(connector.id, contacts.length, result.storedSize);
  }

  async importJson(input: MobileContactsJsonImportRequest): Promise<SyncResult> {
    if (!input.deviceId || !Array.isArray(input.contacts)) {
      throw new ConnectorError("INVALID_CONTACTS_IMPORT", "Contatos JSON invalidos.", 400);
    }

    const connector = await this.connect({ deviceId: input.deviceId });
    const contacts = this.normalizer.normalizeJson(input.contacts);
    const sourceId = `contacts-json:${input.deviceId}:${Date.now()}`;
    const buffer = Buffer.from(JSON.stringify({ deviceId: input.deviceId, contacts: input.contacts }, null, 2), "utf8");
    const result = await this.ingest.ingest({
      connectorId: connector.id,
      sourceId,
      sourceType: "contact",
      fileName: "contacts-export.json",
      mimeType: "application/json",
      buffer,
      metadata: { deviceId: input.deviceId, contactCount: contacts.length }
    });

    for (const contact of contacts) {
      this.repository.createItem({
        id: randomUUID(),
        connectorId: connector.id,
        sourceId: `${sourceId}:${contact.sourceId}`,
        sourceType: "contact",
        title: contact.title,
        mimeType: "application/json",
        originalSize: result.originalSize,
        originalHash: result.originalHash,
        storedFileId: result.storedFileId,
        manifestId: result.manifestId,
        importedAt: new Date().toISOString(),
        metadata: contact.metadata
      });
    }

    return resultToSync(connector.id, contacts.length, result.storedSize);
  }

  async sync(connector: ConnectorRecord, _options: SyncOptions): Promise<SyncResult> {
    return resultToSync(connector.id, 0, 0, ["Mobile Contacts usa importacao VCF/JSON autorizada."]);
  }

  async disconnect(connectorId: string): Promise<void> {
    this.repository.updateConnector(connectorId, { status: "disconnected" });
  }
}

function resultToSync(connectorId: string, imported: number, bytesImported: number, warnings: string[] = []): SyncResult {
  return {
    connectorId,
    jobId: randomUUID(),
    status: "completed",
    scanned: imported,
    imported,
    skipped: 0,
    failed: 0,
    bytesImported,
    warnings,
    errors: []
  };
}
