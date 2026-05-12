import { randomUUID } from "node:crypto";
import type { VaultDatabase } from "../../../db/database";
import type { StorageLocation, StorageLocationStatus } from "../storage.types";

type StorageLocationRow = {
  id: string;
  pool_id: string;
  label: string;
  root_path: string;
  quota_bytes: number;
  used_bytes: number;
  reserved_free_bytes: number;
  status: StorageLocationStatus;
  priority: number;
  is_system_drive: number;
  created_at: string;
  updated_at: string;
  last_checked_at?: string | null;
};

export class StorageLocationRepository {
  constructor(private readonly db: VaultDatabase) {}

  listByPool(poolId: string, includeDisabled = false): StorageLocation[] {
    const sql = includeDisabled
      ? "SELECT * FROM storage_locations WHERE pool_id = ? ORDER BY priority DESC, created_at ASC"
      : "SELECT * FROM storage_locations WHERE pool_id = ? AND status <> 'offline' ORDER BY priority DESC, created_at ASC";
    return this.db.all<StorageLocationRow>(sql, [poolId]).map(mapStorageLocation);
  }

  listAllByPool(poolId: string): StorageLocation[] {
    return this.db
      .all<StorageLocationRow>("SELECT * FROM storage_locations WHERE pool_id = ? ORDER BY priority DESC, created_at ASC", [poolId])
      .map(mapStorageLocation);
  }

  find(id: string): StorageLocation | undefined {
    const row = this.db.get<StorageLocationRow>("SELECT * FROM storage_locations WHERE id = ?", [id]);
    return row ? mapStorageLocation(row) : undefined;
  }

  findByRootPath(rootPath: string): StorageLocation | undefined {
    const row = this.db.get<StorageLocationRow>("SELECT * FROM storage_locations WHERE root_path = ?", [rootPath]);
    return row ? mapStorageLocation(row) : undefined;
  }

  create(input: {
    id?: string;
    poolId: string;
    label: string;
    rootPath: string;
    quotaBytes: number;
    usedBytes?: number;
    reservedFreeBytes: number;
    status?: StorageLocationStatus;
    priority?: number;
    isSystemDrive: boolean;
    now: string;
  }): StorageLocation {
    const id = input.id ?? randomUUID();
    this.db.run(
      `
        INSERT INTO storage_locations (
          id, pool_id, label, root_path, quota_bytes, used_bytes, reserved_free_bytes,
          status, priority, is_system_drive, created_at, updated_at, last_checked_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.poolId,
        input.label,
        input.rootPath,
        input.quotaBytes,
        input.usedBytes ?? 0,
        input.reservedFreeBytes,
        input.status ?? "online",
        input.priority ?? 0,
        input.isSystemDrive ? 1 : 0,
        input.now,
        input.now,
        input.now
      ]
    );

    return this.find(id)!;
  }

  update(id: string, input: Partial<{
    label: string;
    quotaBytes: number;
    usedBytes: number;
    reservedFreeBytes: number;
    status: StorageLocationStatus;
    priority: number;
    isSystemDrive: boolean;
    lastCheckedAt: string;
  }>, now: string): StorageLocation | undefined {
    const assignments: string[] = ["updated_at = ?"];
    const params: Array<string | number | null> = [now];

    add(assignments, params, "label", input.label);
    add(assignments, params, "quota_bytes", input.quotaBytes);
    add(assignments, params, "used_bytes", input.usedBytes);
    add(assignments, params, "reserved_free_bytes", input.reservedFreeBytes);
    add(assignments, params, "status", input.status);
    add(assignments, params, "priority", input.priority);
    if (input.isSystemDrive !== undefined) {
      add(assignments, params, "is_system_drive", input.isSystemDrive ? 1 : 0);
    }
    add(assignments, params, "last_checked_at", input.lastCheckedAt);

    this.db.run(`UPDATE storage_locations SET ${assignments.join(", ")} WHERE id = ?`, [...params, id]);
    return this.find(id);
  }

  incrementUsedBytes(id: string, deltaBytes: number, now: string): void {
    this.db.run(
      "UPDATE storage_locations SET used_bytes = MAX(0, used_bytes + ?), updated_at = ? WHERE id = ?",
      [deltaBytes, now, id]
    );
  }

  delete(id: string): void {
    this.db.run("DELETE FROM storage_locations WHERE id = ?", [id]);
  }
}

function mapStorageLocation(row: StorageLocationRow): StorageLocation {
  return {
    id: row.id,
    poolId: row.pool_id,
    label: row.label,
    rootPath: row.root_path,
    quotaBytes: Number(row.quota_bytes),
    usedBytes: Number(row.used_bytes),
    reservedFreeBytes: Number(row.reserved_free_bytes),
    status: row.status,
    priority: Number(row.priority),
    isSystemDrive: row.is_system_drive === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCheckedAt: row.last_checked_at ?? undefined
  };
}

function add(assignments: string[], params: Array<string | number | null>, column: string, value: unknown): void {
  if (value === undefined) {
    return;
  }

  assignments.push(`${column} = ?`);
  params.push(value as string | number | null);
}
