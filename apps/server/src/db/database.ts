import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import initSqlJs, { type Database } from "sql.js";

const requireFromHere = createRequire(__filename);

export class VaultDatabase {
  private db!: Database;

  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    mkdirSync(dirname(this.dbPath), { recursive: true });

    const wasmBuffer = readFileSync(requireFromHere.resolve("sql.js/dist/sql-wasm.wasm"));
    const wasmBinary = wasmBuffer.buffer.slice(
      wasmBuffer.byteOffset,
      wasmBuffer.byteOffset + wasmBuffer.byteLength
    ) as ArrayBuffer;
    const SQL = await initSqlJs({ wasmBinary });

    this.db = existsSync(this.dbPath) ? new SQL.Database(readFileSync(this.dbPath)) : new SQL.Database();
    this.migrate();
    this.persist();
  }

  run(sql: string, params: Array<string | number | null> = []): void {
    this.db.run(sql, params);
    this.persist();
  }

  all<T extends Record<string, unknown>>(sql: string, params: Array<string | number | null> = []): T[] {
    const statement = this.db.prepare(sql);

    try {
      statement.bind(params);
      const rows: T[] = [];

      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }

      return rows;
    } finally {
      statement.free();
    }
  }

  get<T extends Record<string, unknown>>(sql: string, params: Array<string | number | null> = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  transaction<T>(callback: () => T): T {
    this.db.run("BEGIN");

    try {
      const result = callback();
      this.db.run("COMMIT");
      this.persist();
      return result;
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        total_chunks INTEGER NOT NULL,
        encrypted_bytes INTEGER NOT NULL,
        manifest_sha256 TEXT NOT NULL,
        storage_dir TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
    `);

    this.ensureColumn("files", "storage_dir", "TEXT");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        pool_id TEXT,
        vault_key_id TEXT,
        total_chunks INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        expected_encrypted_bytes INTEGER NOT NULL,
        received_chunks TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.ensureColumn("uploads", "pool_id", "TEXT");
    this.ensureColumn("uploads", "vault_key_id", "TEXT");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS chunk_index (
        chunk_hash TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_chunks (
        file_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_hash TEXT NOT NULL,
        deduplicated INTEGER NOT NULL,
        PRIMARY KEY (file_id, chunk_index)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS storage_pools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mode TEXT NOT NULL,
        quota_bytes INTEGER NOT NULL,
        used_bytes INTEGER NOT NULL DEFAULT 0,
        reserved_free_bytes INTEGER NOT NULL,
        warning_threshold_percent INTEGER NOT NULL,
        critical_threshold_percent INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS storage_locations (
        id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        label TEXT NOT NULL,
        root_path TEXT NOT NULL,
        quota_bytes INTEGER NOT NULL,
        used_bytes INTEGER NOT NULL DEFAULT 0,
        reserved_free_bytes INTEGER NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        is_system_drive INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_checked_at TEXT,
        FOREIGN KEY (pool_id) REFERENCES storage_pools(id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS chunk_locations (
        id TEXT PRIMARY KEY,
        chunk_hash TEXT NOT NULL,
        pool_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        encrypted_size_bytes INTEGER NOT NULL,
        verified_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (pool_id) REFERENCES storage_pools(id),
        FOREIGN KEY (location_id) REFERENCES storage_locations(id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS storage_usage_snapshots (
        id TEXT PRIMARY KEY,
        pool_id TEXT NOT NULL,
        location_id TEXT,
        total_bytes INTEGER NOT NULL,
        available_bytes INTEGER NOT NULL,
        used_by_vault_bytes INTEGER NOT NULL,
        used_by_system_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (pool_id) REFERENCES storage_pools(id),
        FOREIGN KEY (location_id) REFERENCES storage_locations(id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS connectors (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        account_identifier TEXT,
        status TEXT NOT NULL,
        encrypted_credentials_ref TEXT,
        sync_cursor TEXT,
        last_sync_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS connector_items (
        id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        title TEXT,
        mime_type TEXT,
        original_size INTEGER,
        original_hash TEXT,
        stored_file_id TEXT,
        manifest_id TEXT,
        imported_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT,
        metadata_json TEXT,
        FOREIGN KEY (connector_id) REFERENCES connectors(id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS connector_sync_jobs (
        id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        scanned_count INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        bytes_imported INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        report_json TEXT,
        FOREIGN KEY (connector_id) REFERENCES connectors(id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS connector_credentials (
        id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL,
        encrypted_payload_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (connector_id) REFERENCES connectors(id)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS auth_accounts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS auth_device_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT NOT NULL,
        refresh_token_hash TEXT NOT NULL,
        refresh_token_expires_at TEXT NOT NULL,
        revoked_at TEXT,
        last_seen_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (account_id) REFERENCES auth_accounts(id)
      );
    `);

    this.db.run("CREATE INDEX IF NOT EXISTS idx_connectors_type ON connectors(type);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_storage_locations_pool_id ON storage_locations(pool_id);");
    this.db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_locations_root ON storage_locations(root_path);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_chunk_locations_hash ON chunk_locations(chunk_hash);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_chunk_locations_pool_id ON chunk_locations(pool_id);");
    this.db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_chunk_locations_hash_location ON chunk_locations(chunk_hash, location_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_storage_usage_pool_location ON storage_usage_snapshots(pool_id, location_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_connector_items_connector_id ON connector_items(connector_id);");
    this.db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_items_connector_source ON connector_items(connector_id, source_id) WHERE deleted_at IS NULL;"
    );
    this.db.run("CREATE INDEX IF NOT EXISTS idx_connector_items_original_hash ON connector_items(original_hash);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_connector_sync_jobs_connector_id ON connector_sync_jobs(connector_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_connector_credentials_connector_id ON connector_credentials(connector_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_auth_device_sessions_account ON auth_device_sessions(account_id);");
    this.db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_device_sessions_refresh ON auth_device_sessions(refresh_token_hash);");
  }

  private persist(): void {
    writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.all<{ name: string }>(`PRAGMA table_info(${table})`);

    if (!columns.some((item) => item.name === column)) {
      this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      this.persist();
    }
  }
}
