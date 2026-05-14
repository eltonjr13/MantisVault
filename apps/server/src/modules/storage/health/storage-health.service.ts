import { existsSync } from "node:fs";
import type { StoragePoolRepository } from "../pool/storage-pool.repository";
import type { StorageLocationRepository } from "../locations/storage-location.repository";
import type { DiskUsageService } from "./disk-usage.service";
import { findDiskForPath, type DiskHealthReader } from "./disk-health.service";
import type { DiskHealthReport, StorageAlert, StorageLocation, StorageLocationStatus, StoragePoolStatus } from "../storage.types";
import { getAvailableBytes } from "../quota/quota.types";
import { StorageError } from "../storage.errors";

export class StorageHealthService {
  constructor(
    private readonly pools: StoragePoolRepository,
    private readonly locations: StorageLocationRepository,
    private readonly diskUsage: DiskUsageService,
    private readonly diskHealth: DiskHealthReader
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
    let diskHealth: DiskHealthReport | undefined;
    const readDiskHealth = async () => {
      diskHealth ??= await this.diskHealth.checkAll();
      return diskHealth;
    };

    for (const location of locations) {
      const checked = await this.checkLocation(location, readDiskHealth);
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

      if (checked.status === "error") {
        alerts.push({
          code: "STORAGE_DISK_HARDWARE_CRITICAL",
          severity: "critical",
          message: "A saude fisica do disco indica falha ou risco critico.",
          locationId: location.id
        });
      }

      if (checked.disk?.hardwareHealth?.status === "warning") {
        alerts.push({
          code: "STORAGE_DISK_HARDWARE_WARNING",
          severity: "warning",
          message: "O SMART do disco retornou aviso. Recomendamos backup e troca preventiva.",
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

    if (diskHealth && !diskHealth.supported && diskHealth.warnings.length > 0) {
      alerts.unshift({
        code: "STORAGE_DISK_HEALTH_UNAVAILABLE",
        severity: "info",
        message: diskHealth.warnings[0]
      });
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

  private async checkLocation(location: StorageLocation, readDiskHealth: () => Promise<DiskHealthReport>) {
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
        disk: await this.getDiskUsageWithHardware(location, await readDiskHealth())
      };
    }

    const disk = await this.getDiskUsageWithHardware(location, await readDiskHealth());
    const status: StorageLocationStatus = disk.hardwareHealth?.status === "critical"
      ? "error"
      : getAvailableBytes(location) <= 0 || (disk.availableBytes > 0 && disk.availableBytes <= location.reservedFreeBytes)
      ? "full"
      : "online";

    return {
      ...location,
      status,
      disk
    };
  }

  private async getDiskUsageWithHardware(location: StorageLocation, diskHealth: DiskHealthReport) {
    const disk = await this.diskUsage.getDiskUsage(location.rootPath);
    const hardwareHealth = findDiskForPath(location.rootPath, diskHealth);

    return hardwareHealth ? { ...disk, hardwareHealth } : disk;
  }
}
