import type { StoragePoolRepository } from "../pool/storage-pool.repository";
import type { StorageLocationRepository } from "../locations/storage-location.repository";
import type { ChunkLocationRepository } from "../chunks/chunk-location.repository";
import { StorageError } from "../storage.errors";

export class StorageRebalanceService {
  constructor(
    private readonly pools: StoragePoolRepository,
    private readonly locations: StorageLocationRepository,
    private readonly chunks: ChunkLocationRepository
  ) {}

  plan(poolId: string) {
    const pool = this.pools.find(poolId);

    if (!pool || pool.status === "disabled") {
      throw new StorageError("STORAGE_POOL_NOT_FOUND");
    }

    const locations = this.locations.listAllByPool(poolId);
    const distribution = this.chunks.distributionByPool(poolId);
    const totalBytes = distribution.reduce((total, item) => total + Number(item.bytes), 0);
    const averageBytes = locations.length > 0 ? totalBytes / locations.length : 0;
    const suggestedMoves = distribution
      .filter((item) => Number(item.bytes) > averageBytes * 1.25)
      .map((item) => ({
        fromLocationId: item.locationId,
        toLocationId: locations
          .filter((location) => location.id !== item.locationId)
          .sort((a, b) => a.usedBytes - b.usedBytes)[0]?.id,
        reason: "Location acima da distribuicao media.",
        estimatedBytes: Math.max(0, Number(item.bytes) - averageBytes)
      }))
      .filter((item) => Boolean(item.toLocationId));

    return {
      poolId,
      currentDistribution: locations.map((location) => {
        const current = distribution.find((item) => item.locationId === location.id);

        return {
          locationId: location.id,
          label: location.label,
          usedBytes: location.usedBytes,
          chunkCount: Number(current?.chunkCount ?? 0),
          registeredBytes: Number(current?.bytes ?? 0)
        };
      }),
      suggestedMoves,
      estimatedBytesToMove: suggestedMoves.reduce((total, item) => total + item.estimatedBytes, 0),
      executable: false,
      message: "Plano gerado. Movimentacao automatica de chunks ainda nao esta implementada."
    };
  }

  queue(poolId: string) {
    const plan = this.plan(poolId);

    return {
      queued: false,
      status: "not implemented yet",
      message: "Rebalanceamento automatico sera habilitado em uma fase futura.",
      plan
    };
  }
}
