import type { StorageLocation, StoragePool, StoragePoolMode } from "../storage.types";
import { getAvailableBytes } from "../quota/quota.types";

export type AllocationTarget = {
  location: StorageLocation;
  availableBytes: number;
};

export type AllocationPlan = {
  mode: StoragePoolMode;
  targets: AllocationTarget[];
  warnings: string[];
};

export function onlineWritableLocations(locations: StorageLocation[]): StorageLocation[] {
  return locations.filter((location) => location.status === "online");
}

export function sortByAvailableBytes(locations: StorageLocation[]): AllocationTarget[] {
  return locations
    .map((location) => ({ location, availableBytes: getAvailableBytes(location) }))
    .sort((a, b) => b.availableBytes - a.availableBytes || b.location.priority - a.location.priority);
}

export function estimateUsefulCapacity(pool: StoragePool, locations: StorageLocation[]): number {
  if (pool.mode === "mirrored") {
    const sorted = sortByAvailableBytes(locations).slice(0, 2);
    return sorted.length < 2 ? 0 : Math.min(sorted[0].location.quotaBytes, sorted[1].location.quotaBytes);
  }

  if (pool.mode === "single") {
    return locations[0]?.quotaBytes ?? 0;
  }

  return locations.reduce((total, location) => total + location.quotaBytes, 0);
}
