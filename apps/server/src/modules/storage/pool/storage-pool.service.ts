import type { StoragePoolRepository } from "./storage-pool.repository";
import type { StorageLocationRepository } from "../locations/storage-location.repository";
import type { StorageLocationValidator } from "../locations/storage-location-validator";
import type { ChunkLocationRepository } from "../chunks/chunk-location.repository";
import { StorageError } from "../storage.errors";
import type {
  AddStorageLocationInput,
  CreateStoragePoolInput,
  StoragePool,
  StorageUsage,
  UpdateStoragePoolInput
} from "../storage.types";
import {
  DEFAULT_CRITICAL_THRESHOLD_PERCENT,
  DEFAULT_WARNING_THRESHOLD_PERCENT,
  ONE_GB_BYTES,
  getAvailableBytes
} from "../quota/quota.types";
import { estimateUsefulCapacity } from "../allocator/allocation-strategy";

export class StoragePoolService {
  constructor(
    private readonly pools: StoragePoolRepository,
    private readonly locations: StorageLocationRepository,
    private readonly chunks: ChunkLocationRepository,
    private readonly validator: StorageLocationValidator
  ) {}

  list(): StoragePool[] {
    return this.pools.list();
  }

  get(id: string): { pool: StoragePool; locations: ReturnType<StorageLocationRepository["listAllByPool"]> } {
    const pool = this.pools.find(id);

    if (!pool || pool.status === "disabled") {
      throw new StorageError("STORAGE_POOL_NOT_FOUND");
    }

    return {
      pool,
      locations: this.locations.listAllByPool(id)
    };
  }

  async create(input: CreateStoragePoolInput): Promise<{ pool: StoragePool; locations: ReturnType<StorageLocationRepository["listAllByPool"]>; warnings: string[] }> {
    this.validatePoolInput(input);

    if (input.mode === "single" && input.locations.length !== 1) {
      throw new StorageError("STORAGE_INVALID_PATH", "Modo Pasta Unica exige exatamente uma location.");
    }

    if (input.mode === "mirrored" && input.locations.length < 2) {
      throw new StorageError("STORAGE_MIRROR_REQUIRES_TWO_LOCATIONS");
    }

    const now = new Date().toISOString();
    const warnings: string[] = [];

    const validated: Array<{
      label: string;
      rootPath: string;
      quotaBytes: number;
      reservedFreeBytes: number;
      isSystemDrive: boolean;
    }> = [];
    for (const location of input.locations) {
      const result = await this.validator.validate({
        rootPath: location.rootPath,
        quotaBytes: location.quotaBytes,
        reservedFreeBytes: location.reservedFreeBytes,
        existingLocations: validated.map((item) => ({
          id: "",
          poolId: "",
          label: item.label,
          rootPath: item.rootPath,
          quotaBytes: item.quotaBytes,
          usedBytes: 0,
          reservedFreeBytes: item.reservedFreeBytes,
          status: "online",
          priority: 0,
          isSystemDrive: item.isSystemDrive,
          createdAt: now,
          updatedAt: now
        }))
      });
      validated.push({
        ...location,
        rootPath: result.normalizedPath,
        isSystemDrive: result.isSystemDrive
      });
      warnings.push(...result.warnings);
    }

    const pool = this.pools.create({
      name: input.name.trim(),
      mode: input.mode,
      quotaBytes: input.quotaBytes,
      reservedFreeBytes: input.reservedFreeBytes,
      warningThresholdPercent: input.warningThresholdPercent ?? DEFAULT_WARNING_THRESHOLD_PERCENT,
      criticalThresholdPercent: input.criticalThresholdPercent ?? DEFAULT_CRITICAL_THRESHOLD_PERCENT,
      now
    });

    validated.forEach((location, index) => {
      this.locations.create({
        poolId: pool.id,
        label: location.label.trim(),
        rootPath: location.rootPath,
        quotaBytes: location.quotaBytes,
        reservedFreeBytes: location.reservedFreeBytes,
        priority: input.locations.length - index,
        isSystemDrive: location.isSystemDrive,
        now
      });
    });

    return {
      pool,
      locations: this.locations.listAllByPool(pool.id),
      warnings: [...new Set(warnings)]
    };
  }

  update(id: string, input: UpdateStoragePoolInput): StoragePool {
    const pool = this.get(id).pool;

    if (input.quotaBytes !== undefined && input.quotaBytes < Math.max(pool.usedBytes, ONE_GB_BYTES + 1)) {
      throw new StorageError("STORAGE_QUOTA_EXCEEDED", "A nova quota nao pode ser menor que o uso atual nem menor que 1GB.");
    }

    if (input.mode === "mirrored" && this.locations.listAllByPool(id).filter((location) => location.status === "online").length < 2) {
      throw new StorageError("STORAGE_MIRROR_REQUIRES_TWO_LOCATIONS");
    }

    const updated = this.pools.update(id, sanitizeUpdate(input), new Date().toISOString());
    if (!updated) {
      throw new StorageError("STORAGE_POOL_NOT_FOUND");
    }

    return updated;
  }

  disable(id: string): { disabled: true; poolId: string } {
    this.get(id);
    this.pools.update(id, { status: "disabled" }, new Date().toISOString());
    return { disabled: true, poolId: id };
  }

  async addLocation(poolId: string, input: AddStorageLocationInput) {
    const pool = this.get(poolId).pool;
    const existing = this.locations.listAllByPool(pool.id);
    const validated = await this.validator.validate({
      rootPath: input.rootPath,
      quotaBytes: input.quotaBytes,
      reservedFreeBytes: input.reservedFreeBytes,
      existingLocations: existing
    });
    const now = new Date().toISOString();
    const location = this.locations.create({
      poolId,
      label: input.label.trim(),
      rootPath: validated.normalizedPath,
      quotaBytes: input.quotaBytes,
      reservedFreeBytes: input.reservedFreeBytes,
      priority: input.priority ?? 0,
      isSystemDrive: validated.isSystemDrive,
      now
    });

    return { location, warnings: validated.warnings };
  }

  removeLocation(poolId: string, locationId: string): { removed: true; locationId: string } {
    this.get(poolId);
    const location = this.locations.find(locationId);

    if (!location || location.poolId !== poolId) {
      throw new StorageError("STORAGE_LOCATION_NOT_FOUND");
    }

    if (this.chunks.hasExclusiveChunks(locationId)) {
      throw new StorageError("STORAGE_LOCATION_HAS_EXCLUSIVE_CHUNKS");
    }

    this.locations.delete(locationId);
    return { removed: true, locationId };
  }

  usage(poolId: string): StorageUsage {
    const { pool, locations } = this.get(poolId);
    const usefulCapacityBytes = estimateUsefulCapacity(pool, locations);
    const availableBytes = pool.mode === "mirrored"
      ? Math.min(...locations.filter((location) => location.status === "online").map(getAvailableBytes))
      : locations.reduce((total, location) => total + getAvailableBytes(location), 0);
    const usedPercent = pool.quotaBytes > 0 ? Math.min(100, (pool.usedBytes / pool.quotaBytes) * 100) : 0;
    const alerts = [];

    if (usedPercent >= pool.warningThresholdPercent) {
      alerts.push({ code: "STORAGE_WARNING_THRESHOLD", severity: "warning" as const, message: "O cofre esta acima de 80% da quota." });
    }

    if (usedPercent >= pool.criticalThresholdPercent) {
      alerts.push({ code: "STORAGE_CRITICAL_THRESHOLD", severity: "critical" as const, message: "O cofre atingiu o limite critico. Backups automaticos foram pausados." });
    }

    for (const location of locations) {
      if (location.isSystemDrive) {
        alerts.push({
          code: "STORAGE_SYSTEM_DRIVE",
          severity: "warning" as const,
          message: "Este disco parece ser o disco do sistema. Recomendamos reservar espaco livre.",
          locationId: location.id
        });
      }

      if (location.status === "offline") {
        alerts.push({
          code: "STORAGE_LOCATION_OFFLINE",
          severity: "critical" as const,
          message: "Uma location do pool esta offline.",
          locationId: location.id
        });
      }
    }

    if (pool.mode === "mirrored" && locations.filter((location) => location.status === "online").length < 2) {
      alerts.push({
        code: "STORAGE_MIRROR_REQUIRES_TWO_LOCATIONS",
        severity: "critical" as const,
        message: "Modo Protecao exige pelo menos dois discos online."
      });
    }

    return {
      pool,
      usefulCapacityBytes,
      availableBytes: Math.max(0, Number.isFinite(availableBytes) ? availableBytes : 0),
      usedPercent,
      alerts,
      locations: locations.map((location) => ({
        location,
        availableBytes: getAvailableBytes(location),
        usedPercent: location.quotaBytes > 0 ? Math.min(100, (location.usedBytes / location.quotaBytes) * 100) : 0
      }))
    };
  }

  async ensureDefaultPool(input: { name: string; rootPath: string; quotaBytes: number; reservedFreeBytes: number }): Promise<StoragePool> {
    const existing = this.pools.firstActive();

    if (existing) {
      return existing;
    }

    return (await this.create({
      name: input.name,
      mode: "single",
      quotaBytes: input.quotaBytes,
      reservedFreeBytes: input.reservedFreeBytes,
      locations: [{
        label: "Disco Principal",
        rootPath: input.rootPath,
        quotaBytes: input.quotaBytes,
        reservedFreeBytes: input.reservedFreeBytes
      }]
    })).pool;
  }

  private validatePoolInput(input: CreateStoragePoolInput): void {
    if (!input.name?.trim()) {
      throw new StorageError("STORAGE_INVALID_PATH", "Nome do pool ausente.");
    }

    if (!Number.isFinite(input.quotaBytes) || input.quotaBytes <= ONE_GB_BYTES) {
      throw new StorageError("STORAGE_QUOTA_EXCEEDED", "A quota do pool precisa ser maior que 1GB.");
    }

    if (!Number.isFinite(input.reservedFreeBytes) || input.reservedFreeBytes < 0) {
      throw new StorageError("STORAGE_RESERVED_SPACE_VIOLATED", "Reserva de espaco livre invalida.");
    }

    if (!Array.isArray(input.locations) || input.locations.length === 0) {
      throw new StorageError("STORAGE_LOCATION_NOT_FOUND", "Informe ao menos uma location.");
    }
  }
}

function sanitizeUpdate(input: UpdateStoragePoolInput): UpdateStoragePoolInput {
  return {
    ...input,
    name: input.name?.trim()
  };
}
