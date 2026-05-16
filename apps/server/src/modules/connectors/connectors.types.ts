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

export type EmailVaultImportance = "high" | "medium" | "low";

export type EmailVaultCleanupAction =
  | "move-to-trash"
  | "delete-permanently"
  | "remove-attachments";

export type EmailVaultPlanOptions = {
  query?: string;
  olderThanDays?: number;
  minSizeBytes?: number;
  limit?: number;
  includeAlreadyArchived?: boolean;
};

export type EmailVaultAttachmentCandidate = {
  id: string;
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
  important: boolean;
  reasons: string[];
};

export type EmailVaultCandidate = {
  id: string;
  connectorId: string;
  provider: Extract<ConnectorType, "gmail" | "outlook" | "imap">;
  messageId: string;
  subject: string;
  from?: string;
  date?: string;
  sizeBytes: number;
  attachmentBytes: number;
  attachments: EmailVaultAttachmentCandidate[];
  importance: EmailVaultImportance;
  reasons: string[];
  cleanupActions: EmailVaultCleanupAction[];
  archived: boolean;
  archivedItemId?: string;
  labels?: string[];
};

export type EmailVaultPlan = {
  connectorId: string;
  provider: Extract<ConnectorType, "gmail" | "outlook" | "imap">;
  query: string;
  scanned: number;
  candidates: EmailVaultCandidate[];
  totalBytes: number;
  estimatedFreeableBytes: number;
  warnings: string[];
};

export type EmailVaultArchiveRequest = {
  messageIds: string[];
  includeAttachments?: boolean;
  includeRawEmail?: boolean;
};

export type EmailVaultArchiveResult = {
  connectorId: string;
  archived: number;
  skipped: number;
  failed: number;
  bytesArchived: number;
  items: Array<{
    messageId: string;
    itemId: string;
    storedFileId?: string;
    type: "email" | "attachment";
    title: string;
    sizeBytes?: number;
  }>;
  warnings: string[];
  errors: string[];
};

export type EmailVaultCleanupRequest = {
  messageIds: string[];
  action: EmailVaultCleanupAction;
  confirmation: "ARCHIVE_VERIFIED";
};

export type EmailVaultCleanupResult = {
  connectorId: string;
  action: EmailVaultCleanupAction;
  cleaned: number;
  skipped: number;
  failed: number;
  warnings: string[];
  errors: string[];
};

export interface VaultConnector {
  type: ConnectorType;
  connect?(input?: unknown): Promise<ConnectorRecord>;
  sync(connector: ConnectorRecord, options: SyncOptions): Promise<SyncResult>;
  disconnect(connectorId: string): Promise<void>;
  validateConnection?(connectorId: string): Promise<boolean>;
  planEmailVault?(connector: ConnectorRecord, options: EmailVaultPlanOptions): Promise<EmailVaultPlan>;
  archiveEmailVault?(connector: ConnectorRecord, request: EmailVaultArchiveRequest): Promise<EmailVaultArchiveResult>;
  cleanupEmailVault?(connector: ConnectorRecord, request: EmailVaultCleanupRequest): Promise<EmailVaultCleanupResult>;
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
