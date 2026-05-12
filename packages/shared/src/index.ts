export type UploadStatus =
  | "pending"
  | "compressing"
  | "encrypting"
  | "uploading"
  | "paused"
  | "completed"
  | "failed";

export type OptimizationMode = "lossless-safe" | "lossless-archive" | "visual-economy";

export type OptimizationStrategy =
  | "skip"
  | "zstd"
  | "brotli"
  | "xz"
  | "jpeg-xl-lossless"
  | "jpegtran-lossless"
  | "png-lossless"
  | "pdf-lossless"
  | "mp4-remux";

export type CompressionModeName = "skip" | "fast" | "balanced" | "max";

export type CompressionAlgorithm =
  | "store"
  | "deflate-fflate"
  | "zstd"
  | "brotli"
  | "xz"
  | "jpeg-xl-lossless"
  | "jpegtran-lossless"
  | "png-lossless"
  | "pdf-lossless"
  | "mp4-remux";

export interface CompressionDecision {
  mode: CompressionModeName;
  algorithm: CompressionAlgorithm;
  level: 0 | 1 | 6 | 9;
  optimizationMode: OptimizationMode;
  strategy: OptimizationStrategy;
  shouldAttempt: boolean;
  minimumGainPercent: number;
  userMessage: string;
  reason: string;
  warnings: string[];
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
  chunkHashes?: string[];
  chunkAadMode?: "legacy-upload-index" | "content-hash";
  optimizationMode?: OptimizationMode;
  optimizationStrategy?: OptimizationStrategy;
  optimized?: boolean;
  encrypted?: boolean;
  deduplicated?: boolean;
  savedBytes?: number;
  savedPercent?: number;
  originalHash?: string;
  finalHash?: string;
  decisionReason?: string;
  warnings?: string[];
  chunkCount: number;
  chunkSize: number;
  uploadedAt: string;
}

export type OptimizationResult = {
  fileId: string;
  originalName: string;
  originalPath: string;
  outputPath: string;
  originalSize: number;
  finalSize: number;
  savedBytes: number;
  savedPercent: number;
  mode: OptimizationMode;
  strategy: OptimizationStrategy;
  algorithm: string;
  optimized: boolean;
  encrypted: boolean;
  deduplicated: boolean;
  originalHash: string;
  finalHash: string;
  reason: string;
  warnings: string[];
  createdAt: string;
};

export interface VaultFileRecord {
  id: string;
  uploadId?: string;
  storageDir?: string;
  totalChunks: number;
  encryptedBytes: number;
  status: "pending" | "completed";
  createdAt: string;
  completedAt?: string;
}

export interface VaultFileManifestResponse {
  fileId: string;
  uploadId: string;
  totalChunks: number;
  encryptedManifestBase64: string;
}

export interface VaultStats {
  storageDir: string;
  limitBytes: number;
  usedBytes: number;
  remainingBytes: number;
  diskTotalBytes?: number;
  diskFreeBytes?: number;
  diskUsedBytes?: number;
  fileCount: number;
}

export interface VaultSettings {
  storageDir: string;
}
