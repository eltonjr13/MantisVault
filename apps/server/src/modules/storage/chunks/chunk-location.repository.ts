import { randomUUID } from "node:crypto";
import type { VaultDatabase } from "../../../db/database";
import type { ChunkLocation } from "../storage.types";

type ChunkLocationRow = {
  id: string;
  chunk_hash: string;
  pool_id: string;
  location_id: string;
  relative_path: string;
  size_bytes: number;
  encrypted_size_bytes: number;
  verified_at?: string | null;
  created_at: string;
};

export class ChunkLocationRepository {
  constructor(private readonly db: VaultDatabase) {}

  listByHash(chunkHash: string): ChunkLocation[] {
    return this.db
      .all<ChunkLocationRow>("SELECT * FROM chunk_locations WHERE chunk_hash = ? ORDER BY created_at ASC", [chunkHash])
      .map(mapChunkLocation);
  }

  listByPool(poolId: string): ChunkLocation[] {
    return this.db
      .all<ChunkLocationRow>("SELECT * FROM chunk_locations WHERE pool_id = ? ORDER BY created_at ASC", [poolId])
      .map(mapChunkLocation);
  }

  listByLocation(locationId: string): ChunkLocation[] {
    return this.db
      .all<ChunkLocationRow>("SELECT * FROM chunk_locations WHERE location_id = ? ORDER BY created_at ASC", [locationId])
      .map(mapChunkLocation);
  }

  find(chunkHash: string, locationId: string): ChunkLocation | undefined {
    const row = this.db.get<ChunkLocationRow>(
      "SELECT * FROM chunk_locations WHERE chunk_hash = ? AND location_id = ?",
      [chunkHash, locationId]
    );
    return row ? mapChunkLocation(row) : undefined;
  }

  create(input: {
    id?: string;
    chunkHash: string;
    poolId: string;
    locationId: string;
    relativePath: string;
    sizeBytes: number;
    encryptedSizeBytes: number;
    verifiedAt?: string;
    createdAt: string;
  }): ChunkLocation {
    const id = input.id ?? randomUUID();
    this.db.run(
      `
        INSERT OR IGNORE INTO chunk_locations (
          id, chunk_hash, pool_id, location_id, relative_path, size_bytes,
          encrypted_size_bytes, verified_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.chunkHash,
        input.poolId,
        input.locationId,
        input.relativePath,
        input.sizeBytes,
        input.encryptedSizeBytes,
        input.verifiedAt ?? null,
        input.createdAt
      ]
    );

    return this.find(input.chunkHash, input.locationId)!;
  }

  delete(chunkHash: string, locationId: string): void {
    this.db.run("DELETE FROM chunk_locations WHERE chunk_hash = ? AND location_id = ?", [chunkHash, locationId]);
  }

  hasExclusiveChunks(locationId: string): boolean {
    const row = this.db.get<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM chunk_locations own
        WHERE own.location_id = ?
          AND (
            SELECT COUNT(*) FROM chunk_locations other
            WHERE other.chunk_hash = own.chunk_hash
          ) < 2
      `,
      [locationId]
    );

    return Number(row?.count ?? 0) > 0;
  }

  distributionByPool(poolId: string): Array<{ locationId: string; chunkCount: number; bytes: number }> {
    return this.db.all<{ locationId: string; chunkCount: number; bytes: number }>(
      `
        SELECT location_id AS locationId, COUNT(*) AS chunkCount, COALESCE(SUM(encrypted_size_bytes), 0) AS bytes
        FROM chunk_locations
        WHERE pool_id = ?
        GROUP BY location_id
      `,
      [poolId]
    );
  }
}

function mapChunkLocation(row: ChunkLocationRow): ChunkLocation {
  return {
    id: row.id,
    chunkHash: row.chunk_hash,
    poolId: row.pool_id,
    locationId: row.location_id,
    relativePath: row.relative_path,
    sizeBytes: Number(row.size_bytes),
    encryptedSizeBytes: Number(row.encrypted_size_bytes),
    verifiedAt: row.verified_at ?? undefined,
    createdAt: row.created_at
  };
}
