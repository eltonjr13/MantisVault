import type { ConnectorSourceType } from "../../connectors/connectors.types";

export type VaultIngestSource = {
  connectorId?: string;
  sourceId: string;
  sourceType: ConnectorSourceType;
  fileName: string;
  mimeType?: string;
  buffer?: Buffer;
  filePath?: string;
  metadata?: Record<string, unknown>;
};

export type VaultIngestResult = {
  storedFileId: string;
  manifestId: string;
  originalHash: string;
  originalSize: number;
  storedSize: number;
  savedBytes: number;
  savedPercent: number;
  encrypted: boolean;
  deduplicated: boolean;
};
