import type { StoragePool, StoragePoolMode, StoragePoolStatus } from "../storage.types";

export type StoragePoolRow = {
  id: string;
  name: string;
  mode: StoragePoolMode;
  quota_bytes: number;
  used_bytes: number;
  reserved_free_bytes: number;
  warning_threshold_percent: number;
  critical_threshold_percent: number;
  status: StoragePoolStatus;
  created_at: string;
  updated_at: string;
};

export function mapStoragePool(row: StoragePoolRow): StoragePool {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode,
    quotaBytes: Number(row.quota_bytes),
    usedBytes: Number(row.used_bytes),
    reservedFreeBytes: Number(row.reserved_free_bytes),
    warningThresholdPercent: Number(row.warning_threshold_percent),
    criticalThresholdPercent: Number(row.critical_threshold_percent),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
