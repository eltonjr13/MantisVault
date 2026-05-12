export type ConnectorType =
  | "local-files"
  | "android-files"
  | "mobile-contacts"
  | "mobile-calendar"
  | "gmail"
  | "outlook"
  | "imap"
  | "manual-import";

export type ConnectorStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "syncing"
  | "error"
  | "revoked";

export type ConnectorSourceType =
  | "file"
  | "email"
  | "email-attachment"
  | "contact"
  | "calendar-event"
  | "photo"
  | "video"
  | "document";

export type ConnectorSyncStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type ConnectorRecord = {
  id: string;
  type: ConnectorType;
  name: string;
  accountIdentifier?: string;
  status: ConnectorStatus;
  encryptedCredentialsRef?: string;
  syncCursor?: string;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type ConnectorItem = {
  id: string;
  connectorId: string;
  sourceId: string;
  sourceType: ConnectorSourceType;
  title?: string;
  mimeType?: string;
  originalSize?: number;
  originalHash?: string;
  storedFileId?: string;
  manifestId?: string;
  importedAt: string;
  updatedAt?: string;
  deletedAt?: string;
  metadata?: Record<string, unknown>;
};

export type ConnectorSyncJob = {
  id: string;
  connectorId: string;
  status: ConnectorSyncStatus;
  startedAt: string;
  finishedAt?: string;
  scanned: number;
  imported: number;
  skipped: number;
  failed: number;
  bytesImported: number;
  errorMessage?: string;
  report?: Record<string, unknown>;
};

export type SyncOptions = {
  fullSync?: boolean;
  cursor?: string;
  limit?: number;
  dryRun?: boolean;
};

export type SyncResult = {
  connectorId: string;
  jobId: string;
  status: ConnectorSyncStatus;
  scanned: number;
  imported: number;
  skipped: number;
  failed: number;
  bytesImported: number;
  nextCursor?: string;
  warnings: string[];
  errors: string[];
};

export interface VaultConnector {
  type: ConnectorType;
  connect?(input?: unknown): Promise<ConnectorRecord>;
  sync(connector: ConnectorRecord, options: SyncOptions): Promise<SyncResult>;
  disconnect(connectorId: string): Promise<void>;
  validateConnection?(connectorId: string): Promise<boolean>;
}

export type ConnectorCapability = {
  type: ConnectorType;
  name: string;
  available: boolean;
  localFirst: boolean;
  encryptedCredentials: boolean;
  env?: Record<string, boolean>;
  notes?: string[];
};
