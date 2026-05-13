import { calculateSavings, chooseCompressionMode, compressBytes } from "@kazvault/compression";
import { base64ToBytes, encryptBytes, encryptJson, hashChunksSha256, sha256Hex } from "@kazvault/crypto";
import type {
  CompressionAlgorithm,
  FileManifestPlaintext,
  OptimizationMode,
  OptimizationStrategy,
  PairPayload,
  UploadStatus
} from "@kazvault/shared";
import { completeUpload, initUpload, uploadChunk } from "./serverClient";

const CHUNK_SIZE = 8 * 1024 * 1024;
const ENCRYPTED_CHUNK_OVERHEAD_BYTES = 44;

export interface UploadProgressEvent {
  status: UploadStatus;
  progress: number;
  detail: string;
  compression?: UploadCompressionSummary;
  totalChunks?: number;
  completedChunks?: number[];
  uploadId?: string;
  fileId?: string;
}

export interface UploadCompressionSummary {
  originalSize: number;
  compressedSize: number;
  algorithm: CompressionAlgorithm;
  level: number;
  strategy: OptimizationStrategy;
  mode: OptimizationMode;
  optimized: boolean;
  reason: string;
  warnings: string[];
}

export interface UploadResumeState {
  uploadId?: string;
  fileId?: string;
  completedChunks: number[];
}

export async function uploadEncryptedFile(input: {
  file: File;
  masterKey: Uint8Array;
  pairing: PairPayload;
  poolId?: string;
  resume: UploadResumeState;
  signal?: AbortSignal;
  onProgress: (event: UploadProgressEvent) => void;
}): Promise<{ uploadId: string; fileId: string }> {
  throwIfAborted(input.signal);

  input.onProgress({
    status: "compressing",
    progress: 0.04,
    detail: "Analisando compressao"
  });

  const environment = await collectEnvironment(input.file);
  const decision = chooseCompressionMode(environment);
  const totalChunks = Math.max(1, Math.ceil(input.file.size / CHUNK_SIZE));
  const compressedChunkSizes: number[] = [];
  const candidateCompressedChunks: Uint8Array[] = [];
  let candidateCompressedSize = 0;

  const originalHash = await hashFile(input.file);
  const vaultKeyId = await deriveVaultKeyId(input.masterKey);

  if (decision.shouldAttempt) {
    for (let index = 0; index < totalChunks; index += 1) {
      throwIfAborted(input.signal);

      input.onProgress({
        status: "compressing",
        progress: 0.04 + (index / totalChunks) * 0.12,
        detail: `Preparando ${index + 1}/${totalChunks}`,
        totalChunks
      });

      const sourceChunk = await readFileChunk(input.file, index);
      const compressedChunk = await compressBytes(sourceChunk, decision);
      candidateCompressedChunks.push(compressedChunk);
      candidateCompressedSize += compressedChunk.byteLength;
      await yieldToBrowser();
    }
  } else {
    candidateCompressedSize = input.file.size;
  }

  const savings = calculateSavings(input.file.size, candidateCompressedSize);
  const useOptimized = decision.shouldAttempt && savings.accepted;
  const finalSize = useOptimized ? candidateCompressedSize : input.file.size;
  const finalAlgorithm: CompressionAlgorithm = useOptimized ? decision.algorithm : "store";
  const finalLevel = useOptimized ? decision.level : 0;
  const finalHash = useOptimized ? await hashBytes(candidateCompressedChunks) : originalHash;
  const finalReason = !decision.shouldAttempt ? decision.reason : savings.reason;
  const finalChunkHashes = useOptimized
    ? await Promise.all(candidateCompressedChunks.map((chunk) => sha256Hex(chunk)))
    : await hashFileChunks(input.file);

  if (useOptimized) {
    compressedChunkSizes.push(...candidateCompressedChunks.map((chunk) => chunk.byteLength));
  }

  const manifest: FileManifestPlaintext = {
    originalName: input.file.name,
    extension: getExtension(input.file.name),
    mimeType: input.file.type || undefined,
    originalSize: input.file.size,
    compressedSize: finalSize,
    compressionAlgorithm: finalAlgorithm,
    compressionLevel: finalLevel,
    compressionScope: "per-chunk",
    compressedChunkSizes,
    chunkHashes: finalChunkHashes,
    chunkAadMode: "content-hash",
    vaultKeyId,
    optimizationMode: decision.optimizationMode,
    optimizationStrategy: useOptimized ? decision.strategy : "skip",
    optimized: useOptimized,
    encrypted: true,
    deduplicated: new Set(finalChunkHashes).size < finalChunkHashes.length,
    savedBytes: input.file.size - finalSize,
    savedPercent: input.file.size > 0 ? ((input.file.size - finalSize) / input.file.size) * 100 : 0,
    originalHash,
    finalHash,
    decisionReason: finalReason,
    warnings: decision.warnings,
    chunkCount: totalChunks,
    chunkSize: CHUNK_SIZE,
    uploadedAt: new Date().toISOString()
  };

  input.onProgress({
    status: "encrypting",
    progress: 0.18,
    detail: decision.reason,
    compression: {
      originalSize: manifest.originalSize,
      compressedSize: manifest.compressedSize,
      algorithm: manifest.compressionAlgorithm,
      level: manifest.compressionLevel,
      strategy: manifest.optimizationStrategy ?? "skip",
      mode: manifest.optimizationMode ?? "lossless-safe",
      optimized: Boolean(manifest.optimized),
      reason: manifest.decisionReason ?? decision.reason,
      warnings: manifest.warnings ?? []
    },
    totalChunks
  });

  const encryptedManifestBase64 = await encryptJson(manifest, input.masterKey, "kazvault:manifest");
  const encryptedManifestBytes = base64ToBytes(encryptedManifestBase64);
  const manifestSha256 = await sha256Hex(encryptedManifestBytes);
  const expectedEncryptedBytes =
    encryptedManifestBytes.byteLength + finalSize + totalChunks * ENCRYPTED_CHUNK_OVERHEAD_BYTES;

  let uploadId = input.resume.uploadId;
  let fileId = input.resume.fileId;
  let completedChunks = [...input.resume.completedChunks];

  if (!uploadId || !fileId) {
    const upload = await initUpload(input.pairing, {
      encryptedManifestBase64,
      manifestSha256,
      totalChunks,
      chunkSize: CHUNK_SIZE,
      expectedEncryptedBytes,
      vaultKeyId,
      poolId: input.poolId
    });

    uploadId = upload.uploadId;
    fileId = upload.fileId;
    completedChunks = upload.receivedChunks;

    input.onProgress({
      status: "uploading",
      progress: 0.22,
      detail: "Upload inicializado",
      compression: {
        originalSize: manifest.originalSize,
        compressedSize: manifest.compressedSize,
        algorithm: manifest.compressionAlgorithm,
        level: manifest.compressionLevel,
        strategy: manifest.optimizationStrategy ?? "skip",
        mode: manifest.optimizationMode ?? "lossless-safe",
        optimized: Boolean(manifest.optimized),
        reason: manifest.decisionReason ?? decision.reason,
        warnings: manifest.warnings ?? []
      },
      totalChunks,
      completedChunks,
      uploadId,
      fileId
    });
  }

  for (let index = 0; index < totalChunks; index += 1) {
    throwIfAborted(input.signal);

    if (completedChunks.includes(index)) {
      continue;
    }

    input.onProgress({
      status: "encrypting",
      progress: 0.22 + (completedChunks.length / totalChunks) * 0.08,
      detail: `Criptografando ${index + 1}/${totalChunks}`,
      compression: {
        originalSize: manifest.originalSize,
        compressedSize: manifest.compressedSize,
        algorithm: manifest.compressionAlgorithm,
        level: manifest.compressionLevel,
        strategy: manifest.optimizationStrategy ?? "skip",
        mode: manifest.optimizationMode ?? "lossless-safe",
        optimized: Boolean(manifest.optimized),
        reason: manifest.decisionReason ?? decision.reason,
        warnings: manifest.warnings ?? []
      },
      totalChunks,
      completedChunks,
      uploadId,
      fileId
    });

    const sourceChunk = await readFileChunk(input.file, index);
    const compressedChunk = useOptimized ? candidateCompressedChunks[index] : sourceChunk;
    const plainChunkSha256 = finalChunkHashes[index];
    const encryptedChunk = await encryptBytes(compressedChunk, input.masterKey, `kazvault:chunk:${plainChunkSha256}`);
    const chunkSha256 = await sha256Hex(encryptedChunk);
    const response = await uploadChunk({
      pairing: input.pairing,
      uploadId,
      index,
      bytes: encryptedChunk,
      sha256: chunkSha256,
      plainChunkSha256,
      signal: input.signal
    });

    completedChunks = response.receivedChunks;

    input.onProgress({
      status: "uploading",
      progress: 0.3 + (completedChunks.length / totalChunks) * 0.66,
      detail: `Chunk ${completedChunks.length}/${totalChunks}`,
      compression: {
        originalSize: manifest.originalSize,
        compressedSize: manifest.compressedSize,
        algorithm: manifest.compressionAlgorithm,
        level: manifest.compressionLevel,
        strategy: manifest.optimizationStrategy ?? "skip",
        mode: manifest.optimizationMode ?? "lossless-safe",
        optimized: Boolean(manifest.optimized),
        reason: manifest.decisionReason ?? decision.reason,
        warnings: manifest.warnings ?? []
      },
      totalChunks,
      completedChunks,
      uploadId,
      fileId
    });

    await yieldToBrowser();
  }

  throwIfAborted(input.signal);
  await completeUpload(input.pairing, uploadId);

  input.onProgress({
    status: "completed",
    progress: 1,
    detail: "Concluido",
    compression: {
      originalSize: manifest.originalSize,
      compressedSize: manifest.compressedSize,
      algorithm: manifest.compressionAlgorithm,
      level: manifest.compressionLevel,
      strategy: manifest.optimizationStrategy ?? "skip",
      mode: manifest.optimizationMode ?? "lossless-safe",
      optimized: Boolean(manifest.optimized),
      reason: manifest.decisionReason ?? decision.reason,
      warnings: manifest.warnings ?? []
    },
    totalChunks,
    completedChunks,
    uploadId,
    fileId
  });

  return { uploadId, fileId };
}

async function collectEnvironment(file: File) {
  const navigatorWithExtras = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
    connection?: { effectiveType?: string; saveData?: boolean };
  };

  const battery = navigatorWithExtras.getBattery ? await navigatorWithExtras.getBattery().catch(() => undefined) : undefined;

  return {
    fileName: file.name,
    mimeType: file.type || undefined,
    sizeBytes: file.size,
    battery: battery ? { level: battery.level, charging: battery.charging } : undefined,
    network: navigatorWithExtras.connection
      ? {
          effectiveType: navigatorWithExtras.connection.effectiveType,
          saveData: navigatorWithExtras.connection.saveData
        }
      : undefined
  };
}

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

async function readFileChunk(file: File, index: number): Promise<Uint8Array> {
  const start = index * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, file.size);
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

async function hashFile(file: File): Promise<string> {
  async function* chunks() {
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

    for (let index = 0; index < totalChunks; index += 1) {
      yield readFileChunk(file, index);
    }
  }

  return hashChunksSha256(chunks());
}

async function hashFileChunks(file: File): Promise<string[]> {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const hashes: string[] = [];

  for (let index = 0; index < totalChunks; index += 1) {
    hashes.push(await sha256Hex(await readFileChunk(file, index)));
  }

  return hashes;
}

async function hashBytes(chunks: Uint8Array[]): Promise<string> {
  return hashChunksSha256(chunks);
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Upload pausado.", "AbortError");
  }
}

async function deriveVaultKeyId(masterKey: Uint8Array): Promise<string> {
  const prefix = new TextEncoder().encode("kazvault:vault-key-id:v1:");
  const input = new Uint8Array(prefix.byteLength + masterKey.byteLength);
  input.set(prefix, 0);
  input.set(masterKey, prefix.byteLength);
  return sha256Hex(input);
}
