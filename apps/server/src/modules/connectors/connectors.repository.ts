import type { VaultDatabase } from "../../db/database";
import type {
  ConnectorItem,
  ConnectorRecord,
  ConnectorSourceType,
  ConnectorStatus,
  ConnectorSyncJob,
  ConnectorSyncStatus,
  ConnectorType
} from "./connectors.types";

type ConnectorRow = {
  id: string;
  type: ConnectorType;
  name: string;
  account_identifier?: string | null;
  status: ConnectorStatus;
  encrypted_credentials_ref?: string | null;
  sync_cursor?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  connector_id: string;
  source_id: string;
  source_type: ConnectorSourceType;
  title?: string | null;
  mime_type?: string | null;
  original_size?: number | null;
  original_hash?: string | null;
  stored_file_id?: string | null;
  manifest_id?: string | null;
  imported_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  metadata_json?: string | null;
};

type JobRow = {
  id: string;
  connector_id: string;
  status: ConnectorSyncStatus;
  started_at: string;
  finished_at?: string | null;
  scanned_count: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  bytes_imported: number;
  error_message?: string | null;
  report_json?: string | null;
};

export class ConnectorsRepository {
  constructor(private readonly db: VaultDatabase) {}

  createConnector(input: {
    id: string;
    type: ConnectorType;
    name: string;
    accountIdentifier?: string;
    status: ConnectorStatus;
    encryptedCredentialsRef?: string;
    createdAt: string;
  }): ConnectorRecord {
    this.db.run(
      `
        INSERT INTO connectors
          (id, type, name, account_identifier, status, encrypted_credentials_ref, sync_cursor, last_sync_at, last_error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
      `,
      [
        input.id,
        input.type,
        input.name,
        input.accountIdentifier ?? null,
        input.status,
        input.encryptedCredentialsRef ?? null,
        input.createdAt,
        input.createdAt
      ]
    );

    return this.findConnector(input.id)!;
  }

  listConnectors(): ConnectorRecord[] {
    return this.db.all<ConnectorRow>("SELECT * FROM connectors ORDER BY created_at DESC").map(mapConnector);
  }

  findConnector(id: string): ConnectorRecord | undefined {
    const row = this.db.get<ConnectorRow>("SELECT * FROM connectors WHERE id = ?", [id]);
    return row ? mapConnector(row) : undefined;
  }

  updateConnector(id: string, patch: Partial<{
    name: string;
    accountIdentifier: string;
    status: ConnectorStatus;
    encryptedCredentialsRef: string | null;
    syncCursor: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
  }>): ConnectorRecord | undefined {
    const current = this.findConnector(id);

    if (!current) {
      return undefined;
    }

    this.db.run(
      `
        UPDATE connectors
        SET name = ?, account_identifier = ?, status = ?, encrypted_credentials_ref = ?,
            sync_cursor = ?, last_sync_at = ?, last_error = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        patch.name ?? current.name,
        patch.accountIdentifier ?? current.accountIdentifier ?? null,
        patch.status ?? current.status,
        "encryptedCredentialsRef" in patch ? patch.encryptedCredentialsRef ?? null : current.encryptedCredentialsRef ?? null,
        "syncCursor" in patch ? patch.syncCursor ?? null : current.syncCursor ?? null,
        "lastSyncAt" in patch ? patch.lastSyncAt ?? null : current.lastSyncAt ?? null,
        "lastError" in patch ? patch.lastError ?? null : current.lastError ?? null,
        new Date().toISOString(),
        id
      ]
    );

    return this.findConnector(id);
  }

  deleteConnector(id: string): void {
    this.db.run("DELETE FROM connectors WHERE id = ?", [id]);
  }

  createItem(input: Omit<ConnectorItem, "metadata"> & { metadata?: Record<string, unknown> }): ConnectorItem {
    this.db.run(
      `
        INSERT OR IGNORE INTO connector_items
          (id, connector_id, source_id, source_type, title, mime_type, original_size, original_hash, stored_file_id, manifest_id, imported_at, updated_at, deleted_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.id,
        input.connectorId,
        input.sourceId,
        input.sourceType,
        input.title ?? null,
        input.mimeType ?? null,
        input.originalSize ?? null,
        input.originalHash ?? null,
        input.storedFileId ?? null,
        input.manifestId ?? null,
        input.importedAt,
        input.updatedAt ?? null,
        input.deletedAt ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );

    return this.findItem(input.connectorId, input.sourceId)!;
  }

  findItem(connectorId: string, sourceId: string): ConnectorItem | undefined {
    const row = this.db.get<ItemRow>(
      "SELECT * FROM connector_items WHERE connector_id = ? AND source_id = ? AND deleted_at IS NULL",
      [connectorId, sourceId]
    );
    return row ? mapItem(row) : undefined;
  }

  findItemByHash(originalHash: string): ConnectorItem | undefined {
    const row = this.db.get<ItemRow>(
      "SELECT * FROM connector_items WHERE original_hash = ? AND deleted_at IS NULL ORDER BY imported_at DESC LIMIT 1",
      [originalHash]
    );
    return row ? mapItem(row) : undefined;
  }

  listItems(connectorId: string): ConnectorItem[] {
    return this.db
      .all<ItemRow>("SELECT * FROM connector_items WHERE connector_id = ? AND deleted_at IS NULL ORDER BY imported_at DESC", [
        connectorId
      ])
      .map(mapItem);
  }

  softDeleteItems(connectorId: string): void {
    this.db.run("UPDATE connector_items SET deleted_at = ?, updated_at = ? WHERE connector_id = ? AND deleted_at IS NULL", [
      new Date().toISOString(),
      new Date().toISOString(),
      connectorId
    ]);
  }

  createJob(input: { id: string; connectorId: string; status: ConnectorSyncStatus; startedAt: string }): ConnectorSyncJob {
    this.db.run(
      `
        INSERT INTO connector_sync_jobs
          (id, connector_id, status, started_at, finished_at, scanned_count, imported_count, skipped_count, failed_count, bytes_imported, error_message, report_json)
        VALUES (?, ?, ?, ?, NULL, 0, 0, 0, 0, 0, NULL, NULL)
      `,
      [input.id, input.connectorId, input.status, input.startedAt]
    );

    return this.findJob(input.id)!;
  }

  updateJob(id: string, patch: Partial<ConnectorSyncJob>): ConnectorSyncJob | undefined {
    const current = this.findJob(id);

    if (!current) {
      return undefined;
    }

    this.db.run(
      `
        UPDATE connector_sync_jobs
        SET status = ?, finished_at = ?, scanned_count = ?, imported_count = ?, skipped_count = ?,
            failed_count = ?, bytes_imported = ?, error_message = ?, report_json = ?
        WHERE id = ?
      `,
      [
        patch.status ?? current.status,
        patch.finishedAt ?? current.finishedAt ?? null,
        patch.scanned ?? current.scanned,
        patch.imported ?? current.imported,
        patch.skipped ?? current.skipped,
        patch.failed ?? current.failed,
        patch.bytesImported ?? current.bytesImported,
        patch.errorMessage ?? current.errorMessage ?? null,
        patch.report ? JSON.stringify(patch.report) : current.report ? JSON.stringify(current.report) : null,
        id
      ]
    );

    return this.findJob(id);
  }

  findJob(id: string): ConnectorSyncJob | undefined {
    const row = this.db.get<JobRow>("SELECT * FROM connector_sync_jobs WHERE id = ?", [id]);
    return row ? mapJob(row) : undefined;
  }

  upsertCredential(input: { id: string; connectorId: string; encryptedPayloadPath: string; now: string }): void {
    const existing = this.db.get<{ id: string }>("SELECT id FROM connector_credentials WHERE connector_id = ?", [
      input.connectorId
    ]);

    if (existing) {
      this.db.run("UPDATE connector_credentials SET encrypted_payload_path = ?, updated_at = ? WHERE connector_id = ?", [
        input.encryptedPayloadPath,
        input.now,
        input.connectorId
      ]);
      return;
    }

    this.db.run(
      "INSERT INTO connector_credentials (id, connector_id, encrypted_payload_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [input.id, input.connectorId, input.encryptedPayloadPath, input.now, input.now]
    );
  }

  findCredentialPath(connectorId: string): string | undefined {
    return this.db.get<{ encrypted_payload_path: string }>(
      "SELECT encrypted_payload_path FROM connector_credentials WHERE connector_id = ?",
      [connectorId]
    )?.encrypted_payload_path;
  }

  deleteCredential(connectorId: string): void {
    this.db.run("DELETE FROM connector_credentials WHERE connector_id = ?", [connectorId]);
  }
}

function mapConnector(row: ConnectorRow): ConnectorRecord {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    accountIdentifier: row.account_identifier ?? undefined,
    status: row.status,
    encryptedCredentialsRef: row.encrypted_credentials_ref ?? undefined,
    syncCursor: row.sync_cursor ?? undefined,
    lastSyncAt: row.last_sync_at ?? undefined,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapItem(row: ItemRow): ConnectorItem {
  return {
    id: row.id,
    connectorId: row.connector_id,
    sourceId: row.source_id,
    sourceType: row.source_type,
    title: row.title ?? undefined,
    mimeType: row.mime_type ?? undefined,
    originalSize: row.original_size ?? undefined,
    originalHash: row.original_hash ?? undefined,
    storedFileId: row.stored_file_id ?? undefined,
    manifestId: row.manifest_id ?? undefined,
    importedAt: row.imported_at,
    updatedAt: row.updated_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined
  };
}

function mapJob(row: JobRow): ConnectorSyncJob {
  return {
    id: row.id,
    connectorId: row.connector_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    scanned: row.scanned_count,
    imported: row.imported_count,
    skipped: row.skipped_count,
    failed: row.failed_count,
    bytesImported: row.bytes_imported,
    errorMessage: row.error_message ?? undefined,
    report: row.report_json ? JSON.parse(row.report_json) as Record<string, unknown> : undefined
  };
}
