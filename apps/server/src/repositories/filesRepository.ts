import type { VaultFileRecord } from "@kazvault/shared";
import type { VaultDatabase } from "../db/database";

type FileRow = {
  id: string;
  total_chunks: number;
  encrypted_bytes: number;
  manifest_sha256: string;
  status: "pending" | "completed";
  created_at: string;
  completed_at?: string | null;
};

export class FilesRepository {
  constructor(private readonly db: VaultDatabase) {}

  createPending(input: {
    fileId: string;
    totalChunks: number;
    encryptedBytes: number;
    manifestSha256: string;
    createdAt: string;
  }): void {
    this.db.run(
      `
        INSERT INTO files (id, total_chunks, encrypted_bytes, manifest_sha256, status, created_at, completed_at)
        VALUES (?, ?, ?, ?, 'pending', ?, NULL)
      `,
      [input.fileId, input.totalChunks, input.encryptedBytes, input.manifestSha256, input.createdAt]
    );
  }

  markCompleted(fileId: string, completedAt: string): void {
    this.db.run(
      "UPDATE files SET status = 'completed', completed_at = ? WHERE id = ?",
      [completedAt, fileId]
    );
  }

  list(): VaultFileRecord[] {
    return this.db
      .all<FileRow>("SELECT * FROM files ORDER BY created_at DESC")
      .map((row) => ({
        id: row.id,
        totalChunks: row.total_chunks,
        encryptedBytes: row.encrypted_bytes,
        status: row.status,
        createdAt: row.created_at,
        completedAt: row.completed_at ?? undefined
      }));
  }

  countCompleted(): number {
    const row = this.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM files WHERE status = 'completed'");
    return Number(row?.count ?? 0);
  }

  find(fileId: string): VaultFileRecord | undefined {
    const row = this.db.get<FileRow>("SELECT * FROM files WHERE id = ?", [fileId]);

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      totalChunks: row.total_chunks,
      encryptedBytes: row.encrypted_bytes,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined
    };
  }

  delete(fileId: string): void {
    this.db.run("DELETE FROM files WHERE id = ?", [fileId]);
  }
}
