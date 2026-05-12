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
        total_chunks INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        expected_encrypted_bytes INTEGER NOT NULL,
        received_chunks TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
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
