import { basename, extname } from "node:path";
import type { ConnectorSourceType } from "../connectors.types";
import type { VaultIngestSource } from "../../vault/ingest/vault-ingest.types";

export class FileNormalizer {
  toIngestSource(input: {
    connectorId?: string;
    sourceId: string;
    sourceType?: ConnectorSourceType;
    fileName?: string;
    mimeType?: string;
    filePath?: string;
    buffer?: Buffer;
    metadata?: Record<string, unknown>;
  }): VaultIngestSource {
    const fileName = input.fileName ?? (input.filePath ? basename(input.filePath) : "import.bin");

    return {
      connectorId: input.connectorId,
      sourceId: input.sourceId,
      sourceType: input.sourceType ?? inferSourceType(fileName, input.mimeType),
      fileName,
      mimeType: input.mimeType,
      filePath: input.filePath,
      buffer: input.buffer,
      metadata: input.metadata
    };
  }
}

function inferSourceType(fileName: string, mimeType?: string): ConnectorSourceType {
  if (mimeType?.startsWith("image/")) {
    return "photo";
  }

  if (mimeType?.startsWith("video/")) {
    return "video";
  }

  const extension = extname(fileName).toLowerCase();

  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"].includes(extension)) {
    return "photo";
  }

  if ([".mp4", ".mov", ".mkv", ".webm"].includes(extension)) {
    return "video";
  }

  if ([".pdf", ".doc", ".docx", ".txt", ".json", ".csv"].includes(extension)) {
    return "document";
  }

  return "file";
}
