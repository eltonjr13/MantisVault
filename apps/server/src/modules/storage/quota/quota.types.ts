import type { StorageLocation, StoragePool } from "../storage.types";

export const ONE_GB_BYTES = 1_073_741_824;
export const DEFAULT_RESERVED_FREE_BYTES = 20 * ONE_GB_BYTES;
export const DEFAULT_WARNING_THRESHOLD_PERCENT = 80;
export const DEFAULT_CRITICAL_THRESHOLD_PERCENT = 95;

export type QuotaCheckResult = {
  allowed: boolean;
  warnings: string[];
  availableBytes: number;
  projectedUsedBytes: number;
};

export function getAvailableBytes(location: StorageLocation): number {
  return Math.max(
    0,
    location.quotaBytes - location.usedBytes - location.reservedFreeBytes
  );
}

export function getPoolAvailableBytes(pool: StoragePool): number {
  return Math.max(0, pool.quotaBytes - pool.usedBytes - pool.reservedFreeBytes);
}
