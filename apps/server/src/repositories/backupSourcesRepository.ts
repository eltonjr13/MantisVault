import type { VaultDatabase } from "../db/database";

export interface BackupSource {
  id: string;
  name: string;
  type: string;
  path?: string;
  syncInterval: string;
  enabled: boolean;
  status: "idle" | "syncing" | "error";
  lastSyncAt?: string;
  nextSyncAt?: string;
  protectedFilesCount: number;
  errorsCount: number;
  recentErrors: string[];
  createdAt: string;
  updatedAt: string;
}

type BackupSourceRow = {
  id: string;
  name: string;
  type: string;
  path?: string | null;
  sync_interval: string;
  enabled: number;
  status: string;
  last_sync_at?: string | null;
  next_sync_at?: string | null;
  protected_files_count: number;
  errors_count: number;
  recent_errors?: string | null;
  created_at: string;
  updated_at: string;
};

export class BackupSourcesRepository {
  constructor(private readonly db: VaultDatabase) {}

  create(source: Omit<BackupSource, "createdAt" | "updatedAt">): BackupSource {
    const now = new Date().toISOString();
    this.db.run(
      `
        INSERT INTO backup_sources (
          id, name, type, path, sync_interval, enabled, status,
          last_sync_at, next_sync_at, protected_files_count, errors_count,
          recent_errors, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        source.id,
        source.name,
        source.type,
        source.path ?? null,
        source.syncInterval,
        source.enabled ? 1 : 0,
        source.status,
        source.lastSyncAt ?? null,
        source.nextSyncAt ?? null,
        source.protectedFilesCount,
        source.errorsCount,
        JSON.stringify(source.recentErrors),
        now,
        now
      ]
    );
    return this.find(source.id)!;
  }

  list(): BackupSource[] {
    const rows = this.db.all<BackupSourceRow>("SELECT * FROM backup_sources ORDER BY created_at DESC");
    return rows.map(mapRow);
  }

  find(id: string): BackupSource | undefined {
    const row = this.db.get<BackupSourceRow>("SELECT * FROM backup_sources WHERE id = ?", [id]);
    return row ? mapRow(row) : undefined;
  }

  update(id: string, patch: Partial<Omit<BackupSource, "createdAt" | "updatedAt">>): BackupSource | undefined {
    const current = this.find(id);
    if (!current) return undefined;

    const name = patch.name !== undefined ? patch.name : current.name;
    const type = patch.type !== undefined ? patch.type : current.type;
    const path = patch.path !== undefined ? patch.path : current.path;
    const syncInterval = patch.syncInterval !== undefined ? patch.syncInterval : current.syncInterval;
    const enabled = patch.enabled !== undefined ? patch.enabled : current.enabled;
    const status = patch.status !== undefined ? patch.status : current.status;
    const lastSyncAt = patch.lastSyncAt !== undefined ? patch.lastSyncAt : current.lastSyncAt;
    const nextSyncAt = patch.nextSyncAt !== undefined ? patch.nextSyncAt : current.nextSyncAt;
    const protectedFilesCount = patch.protectedFilesCount !== undefined ? patch.protectedFilesCount : current.protectedFilesCount;
    const errorsCount = patch.errorsCount !== undefined ? patch.errorsCount : current.errorsCount;
    const recentErrors = patch.recentErrors !== undefined ? patch.recentErrors : current.recentErrors;
    const now = new Date().toISOString();

    this.db.run(
      `
        UPDATE backup_sources
        SET name = ?, type = ?, path = ?, sync_interval = ?, enabled = ?, status = ?,
            last_sync_at = ?, next_sync_at = ?, protected_files_count = ?, errors_count = ?,
            recent_errors = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        name,
        type,
        path ?? null,
        syncInterval,
        enabled ? 1 : 0,
        status,
        lastSyncAt ?? null,
        nextSyncAt ?? null,
        protectedFilesCount,
        errorsCount,
        JSON.stringify(recentErrors),
        now,
        id
      ]
    );

    return this.find(id);
  }

  delete(id: string): void {
    this.db.run("DELETE FROM backup_sources WHERE id = ?", [id]);
  }

  listDue(nowIso: string): BackupSource[] {
    const rows = this.db.all<BackupSourceRow>(
      "SELECT * FROM backup_sources WHERE enabled = 1 AND status != 'syncing' AND sync_interval != 'manual' AND (next_sync_at IS NULL OR next_sync_at <= ?)",
      [nowIso]
    );
    return rows.map(mapRow);
  }
}

function mapRow(row: BackupSourceRow): BackupSource {
  let recentErrors: string[] = [];
  try {
    if (row.recent_errors) {
      recentErrors = JSON.parse(row.recent_errors);
    }
  } catch {
    // Keep empty array
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    path: row.path ?? undefined,
    syncInterval: row.sync_interval,
    enabled: row.enabled === 1,
    status: row.status as "idle" | "syncing" | "error",
    lastSyncAt: row.last_sync_at ?? undefined,
    nextSyncAt: row.next_sync_at ?? undefined,
    protectedFilesCount: row.protected_files_count,
    errorsCount: row.errors_count,
    recentErrors,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
