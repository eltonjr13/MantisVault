import { DiskUsageService } from "./health/disk-usage.service";
import { StorageLocationValidator } from "./locations/storage-location-validator";
import { QuotaGuardService } from "./quota/quota-guard.service";
import { StorageAllocatorService } from "./allocator/storage-allocator.service";
import { StoragePoolRepository } from "./pool/storage-pool.repository";
import { StorageLocationRepository } from "./locations/storage-location.repository";
import { ChunkLocationRepository } from "./chunks/chunk-location.repository";
import { StoragePoolService } from "./pool/storage-pool.service";
import { StorageLocationService } from "./locations/storage-location.service";
import { ChunkStorageService } from "./chunks/chunk-storage.service";
import { StorageHealthService } from "./health/storage-health.service";
import { StorageRebalanceService } from "./rebalance/storage-rebalance.service";
import { StorageManifestService } from "./manifests/storage-manifest.service";
import type { VaultDatabase } from "../../db/database";

export type StorageManagerModule = ReturnType<typeof buildStorageManagerModule>;

export function buildStorageManagerModule(db: VaultDatabase) {
  const diskUsage = new DiskUsageService();
  const validator = new StorageLocationValidator();
  const quotaGuard = new QuotaGuardService(diskUsage);
  const allocator = new StorageAllocatorService(quotaGuard);
  const poolsRepository = new StoragePoolRepository(db);
  const locationsRepository = new StorageLocationRepository(db);
  const chunkLocationsRepository = new ChunkLocationRepository(db);
  const pools = new StoragePoolService(poolsRepository, locationsRepository, chunkLocationsRepository, validator);
  const locations = new StorageLocationService(locationsRepository);
  const chunks = new ChunkStorageService(poolsRepository, locationsRepository, chunkLocationsRepository, allocator);
  const health = new StorageHealthService(poolsRepository, locationsRepository, diskUsage);
  const rebalance = new StorageRebalanceService(poolsRepository, locationsRepository, chunkLocationsRepository);
  const manifests = new StorageManifestService();

  return {
    diskUsage,
    validator,
    quotaGuard,
    allocator,
    repositories: {
      pools: poolsRepository,
      locations: locationsRepository,
      chunkLocations: chunkLocationsRepository
    },
    pools,
    locations,
    chunks,
    health,
    rebalance,
    manifests
  };
}
