import { StorageError } from "../storage.errors";
import type { StorageLocation, StoragePool } from "../storage.types";
import { getAvailableBytes } from "../quota/quota.types";
import type { QuotaGuardService } from "../quota/quota-guard.service";
import { onlineWritableLocations, sortByAvailableBytes, type AllocationPlan } from "./allocation-strategy";

export class StorageAllocatorService {
  constructor(private readonly quotaGuard: QuotaGuardService) {}

  async selectTargets(pool: StoragePool, locations: StorageLocation[], chunkSize: number): Promise<AllocationPlan> {
    const mode = pool.mode === "hybrid" ? "hybrid" : pool.mode;

    switch (mode) {
      case "single":
        return this.selectSingleTarget(pool, locations, chunkSize);
      case "pooled-capacity":
        return this.selectCapacityTargets(pool, locations, chunkSize);
      case "mirrored":
        return this.selectMirrorTargets(pool, locations, chunkSize);
      case "hybrid":
        return this.selectHybridTargets(pool, locations, chunkSize);
    }
  }

  async selectSingleTarget(pool: StoragePool, locations: StorageLocation[], chunkSize: number): Promise<AllocationPlan> {
    const [primary] = onlineWritableLocations(locations).sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));

    if (!primary) {
      throw new StorageError("STORAGE_LOCATION_OFFLINE");
    }

    const check = await this.quotaGuard.assertCanWrite(pool, primary, chunkSize);

    return {
      mode: "single",
      targets: [{ location: primary, availableBytes: check.availableBytes }],
      warnings: check.warnings
    };
  }

  async selectCapacityTargets(pool: StoragePool, locations: StorageLocation[], chunkSize: number): Promise<AllocationPlan> {
    const candidates = sortByAvailableBytes(onlineWritableLocations(locations)).filter((target) => target.availableBytes >= chunkSize);

    for (const candidate of candidates) {
      try {
        const check = await this.quotaGuard.assertCanWrite(pool, candidate.location, chunkSize);
        return {
          mode: "pooled-capacity",
          targets: [{ location: candidate.location, availableBytes: getAvailableBytes(candidate.location) }],
          warnings: [
            ...check.warnings,
            "Capacidade Maxima nao duplica dados. Este modo nao substitui backup externo."
          ]
        };
      } catch {
        continue;
      }
    }

    throw new StorageError("STORAGE_QUOTA_EXCEEDED");
  }

  async selectMirrorTargets(pool: StoragePool, locations: StorageLocation[], chunkSize: number): Promise<AllocationPlan> {
    const candidates = sortByAvailableBytes(onlineWritableLocations(locations)).filter((target) => target.availableBytes >= chunkSize);

    if (candidates.length < 2) {
      throw new StorageError("STORAGE_MIRROR_REQUIRES_TWO_LOCATIONS");
    }

    const selected = [];
    const warnings: string[] = [];

    for (const candidate of candidates) {
      try {
        const check = await this.quotaGuard.assertCanWrite(pool, candidate.location, chunkSize);
        selected.push({ location: candidate.location, availableBytes: check.availableBytes });
        warnings.push(...check.warnings);
      } catch {
        continue;
      }

      if (selected.length === 2) {
        break;
      }
    }

    if (selected.length < 2) {
      throw new StorageError("STORAGE_MIRROR_REQUIRES_TWO_LOCATIONS");
    }

    return {
      mode: "mirrored",
      targets: selected,
      warnings: [...new Set([...warnings, "Protecao salva duas copias, mas nao substitui backup externo."])]
    };
  }

  async selectHybridTargets(pool: StoragePool, locations: StorageLocation[], chunkSize: number): Promise<AllocationPlan> {
    const plan = await this.selectCapacityTargets(pool, locations, chunkSize);

    return {
      ...plan,
      mode: "hybrid",
      warnings: [
        ...plan.warnings,
        "Smart Pool esta preparado para regras futuras; hoje opera como Capacidade Maxima."
      ]
    };
  }
}
