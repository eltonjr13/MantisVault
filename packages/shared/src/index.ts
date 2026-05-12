export type UploadStatus =
  | "pending"
  | "compressing"
  | "encrypting"
  | "uploading"
  | "paused"
  | "completed"
  | "failed";

export type CompressionModeName = "skip" | "fast" | "balanced" | "max";

export type CompressionAlgorithm = "store" | "deflate-fflate";

export interface CompressionDecision {
  mode: CompressionModeName;
  algorithm: CompressionAlgorithm;
  level: 0 | 1 | 6 | 9;
  reason: string;
}

export interface CompressionInput {
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
  battery?: {
    level: number;
    charging: boolean;
  };
  network?: {
    effectiveType?: string;
    saveData?: boolean;
  };
}

export interface PairPayload {
  app: "KazVault";
  version: 1;
  serverName: string;
  baseUrl: string;
  token: string;
  expiresAt: string;
  fingerprint: string;
}

export interface UploadInitRequest {
  encryptedManifestBase64: string;
  manifestSha256: string;
  totalChunks: number;
  chunkSize: number;
  expectedEncryptedBytes: number;
}

export interface UploadInitResponse {
  uploadId: string;
  fileId: string;
  receivedChunks: number[];
}

export interface UploadChunkResponse {
  uploadId: string;
  index: number;
  receivedChunks: number[];
}

export interface UploadCompleteResponse {
  uploadId: string;
  fileId: string;
  status: "completed";
}

export interface FileManifestPlaintext {
  originalName: string;
  extension: string;
  mimeType?: string;
  originalSize: number;
  compressedSize: number;
  compressionAlgorithm: CompressionAlgorithm;
  compressionLevel: number;
  compressionScope?: "whole-file" | "per-chunk";
  compressedChunkSizes?: number[];
  chunkCount: number;
  chunkSize: number;
  uploadedAt: string;
}

export interface VaultFileRecord {
  id: string;
  totalChunks: number;
  encryptedBytes: number;
  status: "pending" | "completed";
  createdAt: string;
  completedAt?: string;
}

export interface VaultStats {
  storageDir: string;
  limitBytes: number;
  usedBytes: number;
  remainingBytes: number;
  fileCount: number;
}
