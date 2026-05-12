import type { DiskUsageService } from "../health/disk-usage.service";
import { StorageError } from "../storage.errors";
import type { StorageLocation, StoragePool } from "../storage.types";
import { getAvailableBytes, getPoolAvailableBytes, type QuotaCheckResult } from "./quota.types";

export class QuotaGuardService {
  constructor(private readonly diskUsage: DiskUsageService) {}

  async assertCanWrite(pool: StoragePool, location: StorageLocation, chunkSize: number): Promise<QuotaCheckResult> {
    if (location.status !== "online") {
      throw new StorageError("STORAGE_LOCATION_OFFLINE", undefined, { locationId: location.id });
    }

    if (pool.usedBytes + chunkSize > pool.quotaBytes) {
      throw new StorageError("STORAGE_QUOTA_EXCEEDED", undefined, { poolId: pool.id });
    }

    if (location.usedBytes + chunkSize > location.quotaBytes) {
      throw new StorageError("STORAGE_QUOTA_EXCEEDED", undefined, { locationId: location.id });
    }

    const disk = await this.diskUsage.getDiskUsage(location.rootPath);
    if (disk.availableBytes > 0 && disk.availableBytes - chunkSize < location.reservedFreeBytes) {
      throw new StorageError("STORAGE_RESERVED_SPACE_VIOLATED", undefined, {
        locationId: location.id,
        availableBytes: disk.availableBytes,
        reservedFreeBytes: location.reservedFreeBytes
      });
    }

    const locationAvailableBytes = getAvailableBytes(location);
    const poolAvailableBytes = getPoolAvailableBytes(pool);

    if (chunkSize > locationAvailableBytes || chunkSize > poolAvailableBytes) {
      throw new StorageError("STORAGE_RESERVED_SPACE_VIOLATED", undefined, {
        poolId: pool.id,
        locationId: location.id,
        locationAvailableBytes,
        poolAvailableBytes
      });
    }

    const projectedUsedBytes = pool.usedBytes + chunkSize;
    const usedPercent = pool.quotaBytes > 0 ? (projectedUsedBytes / pool.quotaBytes) * 100 : 100;
    const warnings: string[] = [];

    if (usedPercent >= pool.warningThresholdPercent) {
      warnings.push("O cofre esta acima de 80% da quota.");
    }

    if (usedPercent >= pool.criticalThresholdPercent) {
      throw new StorageError(
        "STORAGE_QUOTA_EXCEEDED",
        "O cofre atingiu o limite critico. Backups automaticos foram pausados.",
        { poolId: pool.id, usedPercent }
      );
    }

    if (disk.warning) {
      warnings.push(disk.warning);
    }

    return {
      allowed: true,
      warnings,
      availableBytes: Math.min(locationAvailableBytes, poolAvailableBytes),
      projectedUsedBytes
    };
  }
}
