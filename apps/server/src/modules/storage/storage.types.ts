export type StoragePoolMode =
  | "single"
  | "pooled-capacity"
  | "mirrored"
  | "hybrid";

export type StoragePoolStatus =
  | "active"
  | "readonly"
  | "degraded"
  | "error"
  | "disabled";

export type StorageLocationStatus =
  | "online"
  | "offline"
  | "readonly"
  | "full"
  | "error";

export type StoragePool = {
  id: string;
  name: string;
  mode: StoragePoolMode;
  quotaBytes: number;
  usedBytes: number;
  reservedFreeBytes: number;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
  status: StoragePoolStatus;
  createdAt: string;
  updatedAt: string;
};

export type StorageLocation = {
  id: string;
  poolId: string;
  label: string;
  rootPath: string;
  quotaBytes: number;
  usedBytes: number;
  reservedFreeBytes: number;
  status: StorageLocationStatus;
  priority: number;
  isSystemDrive: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
};

export type ChunkLocation = {
  id: string;
  chunkHash: string;
  poolId: string;
  locationId: string;
  relativePath: string;
  sizeBytes: number;
  encryptedSizeBytes: number;
  verifiedAt?: string;
  createdAt: string;
};

export type CreateStoragePoolInput = {
  name: string;
  mode: StoragePoolMode;
  quotaBytes: number;
  reservedFreeBytes: number;
  warningThresholdPercent?: number;
  criticalThresholdPercent?: number;
  locations: Array<{
    label: string;
    rootPath: string;
    quotaBytes: number;
    reservedFreeBytes: number;
  }>;
};

export type UpdateStoragePoolInput = Partial<{
  name: string;
  mode: StoragePoolMode;
  quotaBytes: number;
  reservedFreeBytes: number;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
}>;

export type AddStorageLocationInput = {
  label: string;
  rootPath: string;
  quotaBytes: number;
  reservedFreeBytes: number;
  priority?: number;
};

export type StoreChunkInput = {
  poolId: string;
  chunkHash: string;
  encryptedBuffer: Buffer;
  preferredMode?: StoragePoolMode;
};

export type StoreChunkResult = {
  chunkHash: string;
  poolId: string;
  storageMode: StoragePoolMode;
  warnings: string[];
  locations: Array<{
    locationId: string;
    relativePath: string;
    sizeBytes: number;
  }>;
};

export type StorageAlert = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  locationId?: string;
};

export type StorageUsage = {
  pool: StoragePool;
  usefulCapacityBytes: number;
  availableBytes: number;
  usedPercent: number;
  alerts: StorageAlert[];
  locations: Array<{
    location: StorageLocation;
    availableBytes: number;
    usedPercent: number;
  }>;
};
