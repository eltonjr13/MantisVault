import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type { StoragePoolRepository } from "../pool/storage-pool.repository";
import type { StorageLocationRepository } from "../locations/storage-location.repository";
import type { ChunkLocationRepository } from "../chunks/chunk-location.repository";
import { StorageError } from "../storage.errors";
import type { StorageLocation } from "../storage.types";
import { getAvailableBytes } from "../quota/quota.types";

type RebalanceMove = {
  chunkHash: string;
  fromLocationId: string;
  toLocationId: string;
  relativePath: string;
  bytes: number;
  reason: string;
  removeSource: boolean;
};

export class StorageRebalanceService {
  constructor(
    private readonly pools: StoragePoolRepository,
    private readonly locations: StorageLocationRepository,
    private readonly chunks: ChunkLocationRepository
  ) {}

  plan(poolId: string) {
    const pool = this.pools.find(poolId);

    if (!pool || pool.status === "disabled") {
      throw new StorageError("STORAGE_POOL_NOT_FOUND");
    }

    const locations = this.locations.listAllByPool(poolId);
    const distribution = this.chunks.distributionByPool(poolId);
    const totalBytes = distribution.reduce((total, item) => total + Number(item.bytes), 0);
    const averageBytes = locations.length > 0 ? totalBytes / locations.length : 0;
    const suggestedMoves = this.buildMoves(poolId, pool.mode === "mirrored", locations, averageBytes);

    return {
      poolId,
      currentDistribution: locations.map((location) => {
        const current = distribution.find((item) => item.locationId === location.id);

        return {
          locationId: location.id,
          label: location.label,
          usedBytes: location.usedBytes,
          chunkCount: Number(current?.chunkCount ?? 0),
          registeredBytes: Number(current?.bytes ?? 0)
        };
      }),
      suggestedMoves,
      estimatedBytesToMove: suggestedMoves.reduce((total, item) => total + item.bytes, 0),
      executable: suggestedMoves.length > 0,
      message: suggestedMoves.length > 0
        ? "Plano pronto para execucao segura."
        : "Nenhum movimento necessario no momento."
    };
  }

  async queue(poolId: string) {
    const plan = this.plan(poolId);
    const executedMoves = [];
    const failedMoves = [];

    for (const move of plan.suggestedMoves.slice(0, 100)) {
      try {
        executedMoves.push(await this.executeMove(move));
      } catch (error) {
        failedMoves.push({
          move,
          error: error instanceof Error ? error.message : "Falha desconhecida."
        });
      }
    }

    return {
      queued: false,
      status: failedMoves.length > 0 ? "completed_with_errors" : "completed",
      message: "Rebalanceamento executado com validacao de copia antes de remover chunks antigos.",
      plan,
      executedMoves,
      failedMoves
    };
  }

  private buildMoves(poolId: string, repairMirrors: boolean, locations: StorageLocation[], averageBytes: number): RebalanceMove[] {
    const online = locations.filter((location) => location.status === "online");
    const chunksByPool = this.chunks.listByPool(poolId);
    const moves: RebalanceMove[] = [];
    const projectedUsed = new Map(online.map((location) => [location.id, location.usedBytes]));

    for (const record of chunksByPool) {
      const copies = this.chunks.listByHash(record.chunkHash).filter((copy) => copy.poolId === poolId);
      const source = online.find((location) => location.id === record.locationId);

      if (!source) {
        continue;
      }

      const sourceProjected = projectedUsed.get(source.id) ?? source.usedBytes;
      const needsMirrorRepair = repairMirrors && copies.length < 2 && online.length >= 2;
      const sourceOverAverage = averageBytes > 0 && sourceProjected > averageBytes * 1.15;

      if (!needsMirrorRepair && !sourceOverAverage) {
        continue;
      }

      const target = online
        .filter((location) => location.id !== source.id)
        .filter((location) => !copies.some((copy) => copy.locationId === location.id))
        .filter((location) => this.projectedAvailable(location, projectedUsed) >= record.encryptedSizeBytes)
        .sort((a, b) => (projectedUsed.get(a.id) ?? a.usedBytes) - (projectedUsed.get(b.id) ?? b.usedBytes))[0];

      if (!target) {
        continue;
      }

      const removeSource = !needsMirrorRepair;
      moves.push({
        chunkHash: record.chunkHash,
        fromLocationId: source.id,
        toLocationId: target.id,
        relativePath: record.relativePath,
        bytes: record.encryptedSizeBytes,
        reason: needsMirrorRepair ? "Reparar redundancia insuficiente." : "Reduzir desequilibrio entre locations.",
        removeSource
      });

      projectedUsed.set(target.id, (projectedUsed.get(target.id) ?? target.usedBytes) + record.encryptedSizeBytes);
      if (removeSource) {
        projectedUsed.set(source.id, Math.max(0, sourceProjected - record.encryptedSizeBytes));
      }
    }

    return moves;
  }

  private projectedAvailable(location: StorageLocation, projectedUsed: Map<string, number>): number {
    return Math.max(0, location.quotaBytes - (projectedUsed.get(location.id) ?? location.usedBytes) - location.reservedFreeBytes);
  }

  private async executeMove(move: RebalanceMove) {
    const source = this.locations.find(move.fromLocationId);
    const target = this.locations.find(move.toLocationId);
    const sourceRecord = this.chunks.find(move.chunkHash, move.fromLocationId);

    if (!source || !target || !sourceRecord) {
      throw new StorageError("STORAGE_LOCATION_NOT_FOUND");
    }

    if (target.status !== "online") {
      throw new StorageError("STORAGE_LOCATION_OFFLINE", undefined, { locationId: target.id });
    }

    if (getAvailableBytes(target) < move.bytes) {
      throw new StorageError("STORAGE_QUOTA_EXCEEDED", undefined, { locationId: target.id });
    }

    const sourcePath = safeJoin(source.rootPath, sourceRecord.relativePath);
    const targetPath = safeJoin(target.rootPath, sourceRecord.relativePath);

    if (!existsSync(sourcePath)) {
      throw new StorageError("STORAGE_LOCATION_OFFLINE", "Chunk de origem nao encontrado para rebalanceamento.");
    }

    await mkdir(resolve(targetPath, ".."), { recursive: true });

    try {
      await copyFile(sourcePath, targetPath);
      await this.verifyCopy(sourcePath, targetPath, move.bytes);
      const now = new Date().toISOString();

      this.chunks.create({
        chunkHash: sourceRecord.chunkHash,
        poolId: sourceRecord.poolId,
        locationId: target.id,
        relativePath: sourceRecord.relativePath,
        sizeBytes: sourceRecord.sizeBytes,
        encryptedSizeBytes: sourceRecord.encryptedSizeBytes,
        verifiedAt: now,
        createdAt: now
      });
      this.locations.incrementUsedBytes(target.id, sourceRecord.encryptedSizeBytes, now);

      if (move.removeSource) {
        const copiesAfterCopy = this.chunks.listByHash(move.chunkHash).filter((copy) => copy.poolId === sourceRecord.poolId);
        if (copiesAfterCopy.length < 2) {
          throw new StorageError("STORAGE_CHUNK_WRITE_FAILED", "Rebalanceamento recusou remover a origem sem copia validada.");
        }

        await rm(sourcePath, { force: true });
        this.chunks.delete(sourceRecord.chunkHash, source.id);
        this.locations.incrementUsedBytes(source.id, -sourceRecord.encryptedSizeBytes, now);
      }

      return {
        ...move,
        verified: true
      };
    } catch (error) {
      await rm(targetPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async verifyCopy(sourcePath: string, targetPath: string, expectedBytes: number): Promise<void> {
    const [sourceStat, targetStat] = await Promise.all([stat(sourcePath), stat(targetPath)]);

    if (sourceStat.size !== expectedBytes || targetStat.size !== expectedBytes) {
      throw new StorageError("STORAGE_CHUNK_WRITE_FAILED", "Copia de rebalanceamento com tamanho invalido.");
    }

    const [sourceHash, targetHash] = await Promise.all([hashFile(sourcePath), hashFile(targetPath)]);

    if (sourceHash !== targetHash) {
      throw new StorageError("STORAGE_CHUNK_WRITE_FAILED", "Copia de rebalanceamento falhou na validacao de hash.");
    }
  }
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
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
