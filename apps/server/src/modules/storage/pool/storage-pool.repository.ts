import { randomUUID } from "node:crypto";
import type { VaultDatabase } from "../../../db/database";
import type { StoragePool, StoragePoolMode, StoragePoolStatus } from "../storage.types";
import { mapStoragePool, type StoragePoolRow } from "./storage-pool.types";

export class StoragePoolRepository {
  constructor(private readonly db: VaultDatabase) {}

  list(includeDisabled = false): StoragePool[] {
    const sql = includeDisabled
      ? "SELECT * FROM storage_pools ORDER BY created_at DESC"
      : "SELECT * FROM storage_pools WHERE status <> 'disabled' ORDER BY created_at DESC";
    return this.db.all<StoragePoolRow>(sql).map(mapStoragePool);
  }

  find(id: string): StoragePool | undefined {
    const row = this.db.get<StoragePoolRow>("SELECT * FROM storage_pools WHERE id = ?", [id]);
    return row ? mapStoragePool(row) : undefined;
  }

  firstActive(): StoragePool | undefined {
    const row = this.db.get<StoragePoolRow>(
      "SELECT * FROM storage_pools WHERE status <> 'disabled' ORDER BY created_at ASC LIMIT 1"
    );
    return row ? mapStoragePool(row) : undefined;
  }

  create(input: {
    id?: string;
    name: string;
    mode: StoragePoolMode;
    quotaBytes: number;
    usedBytes?: number;
    reservedFreeBytes: number;
    warningThresholdPercent: number;
    criticalThresholdPercent: number;
    status?: StoragePoolStatus;
    now: string;
  }): StoragePool {
    const id = input.id ?? randomUUID();
    this.db.run(
      `
        INSERT INTO storage_pools (
          id, name, mode, quota_bytes, used_bytes, reserved_free_bytes,
          warning_threshold_percent, critical_threshold_percent, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        input.name,
        input.mode,
        input.quotaBytes,
        input.usedBytes ?? 0,
        input.reservedFreeBytes,
        input.warningThresholdPercent,
        input.criticalThresholdPercent,
        input.status ?? "active",
        input.now,
        input.now
      ]
    );

    return this.find(id)!;
  }

  update(id: string, input: Partial<{
    name: string;
    mode: StoragePoolMode;
    quotaBytes: number;
    usedBytes: number;
    reservedFreeBytes: number;
    warningThresholdPercent: number;
    criticalThresholdPercent: number;
    status: StoragePoolStatus;
  }>, now: string): StoragePool | undefined {
    const assignments: string[] = ["updated_at = ?"];
    const params: Array<string | number | null> = [now];

    add(assignments, params, "name", input.name);
    add(assignments, params, "mode", input.mode);
    add(assignments, params, "quota_bytes", input.quotaBytes);
    add(assignments, params, "used_bytes", input.usedBytes);
    add(assignments, params, "reserved_free_bytes", input.reservedFreeBytes);
    add(assignments, params, "warning_threshold_percent", input.warningThresholdPercent);
    add(assignments, params, "critical_threshold_percent", input.criticalThresholdPercent);
    add(assignments, params, "status", input.status);

    this.db.run(`UPDATE storage_pools SET ${assignments.join(", ")} WHERE id = ?`, [...params, id]);
    return this.find(id);
  }

  incrementUsedBytes(id: string, deltaBytes: number, now: string): void {
    this.db.run(
      "UPDATE storage_pools SET used_bytes = MAX(0, used_bytes + ?), updated_at = ? WHERE id = ?",
      [deltaBytes, now, id]
    );
  }

  transaction<T>(callback: () => T): T {
    return this.db.transaction(callback);
  }
}

function add(assignments: string[], params: Array<string | number | null>, column: string, value: unknown): void {
  if (value === undefined) {
    return;
  }

  assignments.push(`${column} = ?`);
  params.push(value as string | number | null);
}
