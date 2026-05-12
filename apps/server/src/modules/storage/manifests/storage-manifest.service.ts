import type { StoreChunkResult } from "../storage.types";

export class StorageManifestService {
  buildChunkManifest(input: {
    chunkHash: string;
    plainSizeBytes: number;
    storage: StoreChunkResult;
    deduplicated: boolean;
  }) {
    return {
      hash: input.chunkHash,
      size: input.plainSizeBytes,
      deduplicated: input.deduplicated,
      poolId: input.storage.poolId,
      storageMode: input.storage.storageMode,
      redundancyLevel: input.storage.locations.length,
      storageWarnings: input.storage.warnings,
      locations: input.storage.locations.map((location) => ({
        locationId: location.locationId,
        relativePath: location.relativePath
      }))
    };
  }
}
