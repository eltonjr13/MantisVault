import { randomUUID } from "node:crypto";
import type { ConnectorsRepository } from "../../connectors.repository";
import { ConnectorError } from "../../connectors.errors";
import type { ConnectorRecord, SyncOptions, SyncResult, VaultConnector } from "../../connectors.types";
import { CalendarNormalizer } from "../../normalizers/calendar.normalizer";
import type { VaultIngestService } from "../../../vault/ingest/vault-ingest.service";
import type { MobileCalendarJsonImportRequest } from "./mobile-calendar.types";

export class MobileCalendarConnector implements VaultConnector {
  readonly type = "mobile-calendar" as const;
  private readonly normalizer = new CalendarNormalizer();

  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly ingest: VaultIngestService
  ) {}

  async connect(input?: unknown): Promise<ConnectorRecord> {
    const body = (input ?? {}) as { deviceId?: string };
    return this.repository.createConnector({
      id: randomUUID(),
      type: this.type,
      name: "Calendario do celular",
      accountIdentifier: body.deviceId,
      status: "connected",
      createdAt: new Date().toISOString()
    });
  }

  async importIcs(input: { file: Buffer; fileName?: string; deviceId: string }): Promise<SyncResult> {
    if (!input.deviceId || !input.file?.byteLength) {
      throw new ConnectorError("INVALID_CALENDAR_IMPORT", "ICS ou deviceId ausente.", 400);
    }

    const connector = await this.connect({ deviceId: input.deviceId });
    const events = this.normalizer.parseIcs(input.file);
    const sourceId = `calendar-ics:${input.deviceId}:${Date.now()}`;
    const result = await this.ingest.ingest({
      connectorId: connector.id,
      sourceId,
      sourceType: "calendar-event",
      fileName: input.fileName ?? "calendar.ics",
      mimeType: "text/calendar",
      buffer: input.file,
      metadata: { deviceId: input.deviceId, eventCount: events.length }
    });

    for (const event of events) {
      this.repository.createItem({
        id: randomUUID(),
        connectorId: connector.id,
        sourceId: `${sourceId}:${event.sourceId}`,
        sourceType: "calendar-event",
        title: event.title,
        mimeType: "text/calendar",
        originalSize: result.originalSize,
        originalHash: result.originalHash,
        storedFileId: result.storedFileId,
        manifestId: result.manifestId,
        importedAt: new Date().toISOString(),
        metadata: event.metadata
      });
    }

    return resultToSync(connector.id, events.length, result.storedSize);
  }

  async importJson(input: MobileCalendarJsonImportRequest): Promise<SyncResult> {
    if (!input.deviceId || !Array.isArray(input.events)) {
      throw new ConnectorError("INVALID_CALENDAR_IMPORT", "Eventos JSON invalidos.", 400);
    }

    const connector = await this.connect({ deviceId: input.deviceId });
    const events = this.normalizer.normalizeJson(input.events);
    const sourceId = `calendar-json:${input.deviceId}:${Date.now()}`;
    const buffer = Buffer.from(JSON.stringify({ deviceId: input.deviceId, events: input.events }, null, 2), "utf8");
    const result = await this.ingest.ingest({
      connectorId: connector.id,
      sourceId,
      sourceType: "calendar-event",
      fileName: "calendar-export.json",
      mimeType: "application/json",
      buffer,
      metadata: { deviceId: input.deviceId, eventCount: events.length }
    });

    for (const event of events) {
      this.repository.createItem({
        id: randomUUID(),
        connectorId: connector.id,
        sourceId: `${sourceId}:${event.sourceId}`,
        sourceType: "calendar-event",
        title: event.title,
        mimeType: "application/json",
        originalSize: result.originalSize,
        originalHash: result.originalHash,
        storedFileId: result.storedFileId,
        manifestId: result.manifestId,
        importedAt: new Date().toISOString(),
        metadata: event.metadata
      });
    }

    return resultToSync(connector.id, events.length, result.storedSize);
  }

  async sync(connector: ConnectorRecord, _options: SyncOptions): Promise<SyncResult> {
    return resultToSync(connector.id, 0, 0, ["Mobile Calendar usa importacao ICS/JSON autorizada."]);
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
