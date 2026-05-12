import { existsSync } from "node:fs";
import type { StoragePoolRepository } from "../pool/storage-pool.repository";
import type { StorageLocationRepository } from "../locations/storage-location.repository";
import type { DiskUsageService } from "./disk-usage.service";
import type { StorageAlert, StorageLocation, StorageLocationStatus, StoragePoolStatus } from "../storage.types";
import { getAvailableBytes } from "../quota/quota.types";
import { StorageError } from "../storage.errors";

export class StorageHealthService {
  constructor(
    private readonly pools: StoragePoolRepository,
    private readonly locations: StorageLocationRepository,
    private readonly diskUsage: DiskUsageService
  ) {}

  async checkPool(poolId: string) {
    const pool = this.pools.find(poolId);

    if (!pool || pool.status === "disabled") {
      throw new StorageError("STORAGE_POOL_NOT_FOUND");
    }

    const locations = this.locations.listAllByPool(poolId);
    const checkedLocations = [];
    const alerts: StorageAlert[] = [];
    const now = new Date().toISOString();

    for (const location of locations) {
      const checked = await this.checkLocation(location);
      checkedLocations.push(checked);
      this.locations.update(location.id, {
        status: checked.status,
        lastCheckedAt: now
      }, now);

      if (checked.status === "offline") {
        alerts.push({
          code: "STORAGE_LOCATION_OFFLINE",
          severity: "critical",
          message: "Uma location do pool esta offline.",
          locationId: location.id
        });
      }

      if (checked.status === "readonly") {
        alerts.push({
          code: "STORAGE_LOCATION_NOT_WRITABLE",
          severity: "critical",
          message: "A pasta de armazenamento nao permite escrita.",
          locationId: location.id
        });
      }

      if (checked.status === "full") {
        alerts.push({
          code: "STORAGE_RESERVED_SPACE_VIOLATED",
          severity: "critical",
          message: "A location atingiu quota ou reserva de espaco livre.",
          locationId: location.id
        });
      }

      if (location.isSystemDrive) {
        alerts.push({
          code: "STORAGE_SYSTEM_DRIVE",
          severity: "warning",
          message: "Este disco parece ser o disco do sistema. Recomendamos reservar espaco livre.",
          locationId: location.id
        });
      }
    }

    const onlineCount = checkedLocations.filter((location) => location.status === "online").length;
    let status: StoragePoolStatus = "active";

    if (pool.mode === "mirrored" && onlineCount > 0 && onlineCount < 2) {
      status = "readonly";
      alerts.push({
        code: "STORAGE_MIRROR_REQUIRES_TWO_LOCATIONS",
        severity: "critical",
        message: "Modo Protecao exige pelo menos dois discos online."
      });
    } else if (onlineCount < checkedLocations.length) {
      status = pool.mode === "mirrored" && onlineCount >= 2 ? "degraded" : "degraded";
    }

    if (onlineCount === 0) {
      status = "error";
    }

    this.pools.update(pool.id, { status }, now);

    return {
      pool: this.pools.find(pool.id)!,
      locations: checkedLocations,
      alerts
    };
  }

  private async checkLocation(location: StorageLocation) {
    if (!existsSync(location.rootPath)) {
      return {
        ...location,
        status: "offline" as const,
        disk: undefined
      };
    }

    const writable = await this.diskUsage.isWritable(location.rootPath);
    if (!writable) {
      return {
        ...location,
        status: "readonly" as const,
        disk: await this.diskUsage.getDiskUsage(location.rootPath)
      };
    }

    const disk = await this.diskUsage.getDiskUsage(location.rootPath);
    const status: StorageLocationStatus = getAvailableBytes(location) <= 0 || (disk.availableBytes > 0 && disk.availableBytes <= location.reservedFreeBytes)
      ? "full"
      : "online";

    return {
      ...location,
      status,
      disk
    };
  }
}
