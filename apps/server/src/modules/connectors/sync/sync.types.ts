export type SyncProgressEventName =
  | "connector.sync.started"
  | "connector.sync.progress"
  | "connector.sync.item_imported"
  | "connector.sync.completed"
  | "connector.sync.failed";

export type SyncProgressPayload = {
  jobId: string;
  connectorId: string;
  scanned: number;
  imported: number;
  skipped: number;
  failed: number;
  message: string;
};
