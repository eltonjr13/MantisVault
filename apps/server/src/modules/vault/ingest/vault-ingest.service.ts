import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FilesRepository } from "../../../repositories/filesRepository";
import type { ChunksRepository } from "../../../repositories/chunksRepository";
import type { StorageService } from "../../../services/storageService";
import { optimizeLocalFile } from "../../../vault/optimizer/optimizer.service";
import { hashChunk, sha256File } from "../../../vault/chunks/hash.service";
import { readChunkSizeBytes, splitIntoChunks } from "../../../vault/chunks/chunker.service";
import { ConnectorKeyManager } from "../../connectors/credentials/token-vault.service";
import type { VaultIngestResult, VaultIngestSource } from "./vault-ingest.types";
import type { StorageManagerModule } from "../../storage/storage.service";
import type { StoreChunkResult } from "../../storage/storage.types";

export class VaultIngestService {
  constructor(
    private readonly storage: StorageService,
    private readonly filesRepository: FilesRepository,
    private readonly chunksRepository: ChunksRepository,
    private readonly keyManager: ConnectorKeyManager,
    private readonly storageManager: StorageManagerModule
  ) {}

  async ingest(source: VaultIngestSource): Promise<VaultIngestResult> {
    if (!source.buffer && !source.filePath) {
      throw new Error("Fonte de ingestao sem buffer ou filePath.");
    }

    const tempDir = join(this.storage.storageDir, "imports-temp", randomUUID());
    await mkdir(tempDir, { recursive: true });

    try {
      const inputPath = await this.materializeSource(source, tempDir);
      const optimizedPath = join(tempDir, `optimized-${basename(source.fileName)}`);
      const originalSize = (await stat(inputPath)).size;
      const originalHash = await sha256File(inputPath);
      const optimization = await optimizeLocalFile({
        originalName: source.fileName,
        inputPath,
        outputPath: optimizedPath,
        mimeType: source.mimeType
      });
      const finalPath = existsSync(optimization.outputPath) ? optimization.outputPath : inputPath;
      const finalBytes = await readFile(finalPath);
      const chunks = splitIntoChunks(finalBytes, readChunkSizeBytes());
      const fileId = optimization.fileId || randomUUID();
      const now = new Date().toISOString();
      const key = await this.keyManager.getKey();
      let encryptedBytes = 0;
      let deduplicated = false;
      const defaultPool = this.storageManager.repositories.pools.firstActive();

      if (!defaultPool) {
        throw new Error("Nenhum storage pool ativo configurado.");
      }

      const manifestChunks: Array<{
        index: number;
        hash: string;
        size: number;
        deduplicated: boolean;
        poolId?: string;
        storageMode?: string;
        locations: Array<{ locationId: string; relativePath: string }>;
        redundancyLevel: number;
        storageWarnings: string[];
      }> = [];

      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const chunkHash = hashChunk(chunk);
        const existing = this.chunksRepository.findIndexedChunk(chunkHash);

        if (existing) {
          deduplicated = true;
          this.chunksRepository.mapFileChunk({ fileId, chunkIndex: index, chunkHash, deduplicated: true });
          const stored = this.existingStorageResult(defaultPool.id, chunkHash);
          manifestChunks.push({
            index,
            ...this.storageManager.manifests.buildChunkManifest({
              chunkHash,
              plainSizeBytes: chunk.byteLength,
              storage: stored,
              deduplicated: true
            })
          });
          continue;
        }

        const encrypted = encryptBytes(chunk, key, `kazvault:file:${fileId}:chunk:${index}`);
        encryptedBytes += encrypted.byteLength;
        const stored = await this.storageManager.chunks.storeChunk({
          poolId: defaultPool.id,
          chunkHash,
          encryptedBuffer: encrypted
        });
        this.chunksRepository.indexChunk({
          chunkHash,
          fileId,
          chunkIndex: index,
          sizeBytes: chunk.byteLength,
          createdAt: now
        });
        this.chunksRepository.mapFileChunk({ fileId, chunkIndex: index, chunkHash, deduplicated: false });
        manifestChunks.push({
          index,
          ...this.storageManager.manifests.buildChunkManifest({
            chunkHash,
            plainSizeBytes: chunk.byteLength,
            storage: stored,
            deduplicated: false
          })
        });
      }

      const manifest = {
        version: 1,
        fileId,
        poolId: defaultPool.id,
        storageMode: defaultPool.mode,
        redundancyLevel: defaultPool.mode === "mirrored" ? 2 : 1,
        storageWarnings: [...new Set(manifestChunks.flatMap((chunk) => chunk.storageWarnings))],
        source: {
          connectorId: source.connectorId,
          sourceId: source.sourceId,
          sourceType: source.sourceType,
          fileName: source.fileName,
          mimeType: source.mimeType,
          metadata: source.metadata
        },
        optimization,
        chunks: manifestChunks,
        createdAt: now
      };
      const encryptedManifest = encryptBytes(
        Buffer.from(JSON.stringify(manifest), "utf8"),
        key,
        `kazvault:file:${fileId}:manifest`
      );
      const manifestSha256 = createHash("sha256").update(encryptedManifest).digest("hex");
      encryptedBytes += encryptedManifest.byteLength;

      await this.storage.writeEncryptedManifest(fileId, encryptedManifest);
      this.filesRepository.createPending({
        fileId,
        totalChunks: chunks.length,
        encryptedBytes,
        manifestSha256,
        storageDir: this.storage.storageDir,
        createdAt: now
      });
      this.filesRepository.markCompleted(fileId, now);

      return {
        storedFileId: fileId,
        manifestId: fileId,
        originalHash,
        originalSize,
        storedSize: encryptedBytes,
        savedBytes: optimization.savedBytes,
        savedPercent: optimization.savedPercent,
        encrypted: true,
        deduplicated
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async materializeSource(source: VaultIngestSource, tempDir: string): Promise<string> {
    const inputPath = join(tempDir, basename(source.fileName || "import.bin"));

    if (source.buffer) {
      await writeFile(inputPath, source.buffer);
      return inputPath;
    }

    if (!source.filePath) {
      throw new Error("Arquivo de origem ausente.");
    }

    await copyFile(source.filePath, inputPath);
    return inputPath;
  }

  private existingStorageResult(poolId: string, chunkHash: string): StoreChunkResult {
    const locations = this.storageManager.repositories.chunkLocations.listByHash(chunkHash);
    const pool = this.storageManager.repositories.pools.find(poolId);

    return {
      chunkHash,
      poolId,
      storageMode: pool?.mode ?? "single",
      warnings: locations.length === 0 ? ["Chunk deduplicado legado sem registro de location no Storage Manager."] : [],
      locations: locations.map((location) => ({
        locationId: location.locationId,
        relativePath: location.relativePath,
        sizeBytes: location.sizeBytes
      }))
    };
  }
}

function encryptBytes(bytes: Uint8Array, key: Buffer, aad: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from("KZV2"), iv, tag, encrypted]);
}
