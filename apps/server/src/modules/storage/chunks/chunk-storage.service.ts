import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { StoragePoolRepository } from "../pool/storage-pool.repository";
import type { StorageLocationRepository } from "../locations/storage-location.repository";
import type { StorageAllocatorService } from "../allocator/storage-allocator.service";
import type { ChunkLocationRepository } from "./chunk-location.repository";
import { StorageError } from "../storage.errors";
import type { StoreChunkInput, StoreChunkResult } from "../storage.types";

export class ChunkStorageService {
  constructor(
    private readonly pools: StoragePoolRepository,
    private readonly locations: StorageLocationRepository,
    private readonly chunkLocations: ChunkLocationRepository,
    private readonly allocator: StorageAllocatorService
  ) {}

  async storeChunk(input: StoreChunkInput): Promise<StoreChunkResult> {
    assertHash(input.chunkHash);
    const pool = this.pools.find(input.poolId);

    if (!pool || pool.status === "disabled") {
      throw new StorageError("STORAGE_POOL_NOT_FOUND");
    }

    const locations = this.locations.listAllByPool(pool.id);
    const plan = await this.allocator.selectTargets(
      input.preferredMode ? { ...pool, mode: input.preferredMode } : pool,
      locations,
      input.encryptedBuffer.byteLength,
      {
        sourceFileName: input.sourceFileName,
        sourceMimeType: input.sourceMimeType,
        plainSizeBytes: input.plainSizeBytes,
        importance: input.importance
      }
    );
    const relativePath = this.relativeChunkPath(input.chunkHash);
    const written: Array<{ locationId: string; path: string; bytes: number }> = [];

    try {
      for (const target of plan.targets) {
        const absolutePath = safeJoin(target.location.rootPath, relativePath);
        const existing = this.chunkLocations.find(input.chunkHash, target.location.id);

        if (existing && existsSync(absolutePath)) {
          written.push({ locationId: target.location.id, path: absolutePath, bytes: 0 });
          continue;
        }

        await mkdir(resolve(absolutePath, ".."), { recursive: true });
        const alreadyExists = existsSync(absolutePath);

        if (alreadyExists) {
          const current = await readFile(absolutePath);
          if (!current.equals(input.encryptedBuffer)) {
            throw new StorageError("STORAGE_CHUNK_WRITE_FAILED", "Chunk existente diverge do buffer recebido.");
          }
        } else {
          await writeFile(absolutePath, input.encryptedBuffer, { flag: "wx" });
        }

        const fileStat = await stat(absolutePath);
        if (fileStat.size !== input.encryptedBuffer.byteLength) {
          throw new StorageError("STORAGE_CHUNK_WRITE_FAILED", "Chunk gravado com tamanho inesperado.");
        }

        written.push({ locationId: target.location.id, path: absolutePath, bytes: alreadyExists ? 0 : input.encryptedBuffer.byteLength });
      }
    } catch (error) {
      if (plan.mode === "mirrored") {
        await Promise.all(
          written
            .filter((item) => item.bytes > 0)
            .map((item) => rm(item.path, { force: true }).catch(() => undefined))
        );
      }

      throw error instanceof StorageError
        ? error
        : new StorageError("STORAGE_CHUNK_WRITE_FAILED", error instanceof Error ? error.message : undefined);
    }

    const now = new Date().toISOString();
    const resultLocations = [];

    for (const target of plan.targets) {
      const existing = this.chunkLocations.find(input.chunkHash, target.location.id);
      const record = existing ?? this.chunkLocations.create({
        chunkHash: input.chunkHash,
        poolId: pool.id,
        locationId: target.location.id,
        relativePath,
        sizeBytes: input.encryptedBuffer.byteLength,
        encryptedSizeBytes: input.encryptedBuffer.byteLength,
        verifiedAt: now,
        createdAt: now
      });
      resultLocations.push({
        locationId: record.locationId,
        relativePath: record.relativePath,
        sizeBytes: record.sizeBytes
      });
    }

    const newBytesByLocation = new Map<string, number>();
    for (const item of written) {
      if (item.bytes > 0) {
        newBytesByLocation.set(item.locationId, (newBytesByLocation.get(item.locationId) ?? 0) + item.bytes);
      }
    }

    for (const [locationId, bytes] of newBytesByLocation) {
      this.locations.incrementUsedBytes(locationId, bytes, now);
    }

    const uniqueNewBytes = written.some((item) => item.bytes > 0) ? input.encryptedBuffer.byteLength : 0;
    if (uniqueNewBytes > 0) {
      this.pools.incrementUsedBytes(pool.id, uniqueNewBytes, now);
    }

    return {
      chunkHash: input.chunkHash,
      poolId: pool.id,
      storageMode: plan.mode,
      warnings: [...new Set(plan.warnings)],
      locations: resultLocations
    };
  }

  async readChunk(chunkHash: string): Promise<Buffer | undefined> {
    assertHash(chunkHash);
    const records = this.chunkLocations.listByHash(chunkHash);

    for (const record of records) {
      const location = this.locations.find(record.locationId);
      if (!location || location.status === "offline") {
        continue;
      }

      const absolutePath = safeJoin(location.rootPath, record.relativePath);
      if (existsSync(absolutePath)) {
        return readFile(absolutePath);
      }
    }

    return undefined;
  }

  relativeChunkPath(chunkHash: string): string {
    assertHash(chunkHash);
    return `chunks/${chunkHash.slice(0, 2).toLowerCase()}/${chunkHash.toLowerCase()}.mvchunk`;
  }
}

function assertHash(value: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new StorageError("STORAGE_INVALID_PATH", "Hash de chunk invalido.");
  }
}

function safeJoin(rootPath: string, relativePath: string): string {
  if (relativePath.includes("..")) {
    throw new StorageError("STORAGE_INVALID_PATH");
  }

  const root = resolve(rootPath);
  const target = resolve(root, relativePath);
  const rel = relative(root, target);

  if (rel.startsWith("..") || rel === "" || resolve(target) === root) {
    throw new StorageError("STORAGE_INVALID_PATH");
  }

  return target;
}
