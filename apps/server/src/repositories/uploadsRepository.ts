import type { UploadStatus } from "@kazvault/shared";
import type { VaultDatabase } from "../db/database";

export interface UploadRecord {
  id: string;
  fileId: string;
  poolId?: string;
  vaultKeyId?: string;
  totalChunks: number;
  chunkSize: number;
  expectedEncryptedBytes: number;
  receivedChunks: number[];
  status: UploadStatus;
  createdAt: string;
  updatedAt: string;
}

type UploadRow = {
  id: string;
  file_id: string;
  pool_id?: string | null;
  vault_key_id?: string | null;
  total_chunks: number;
  chunk_size: number;
  expected_encrypted_bytes: number;
  received_chunks: string;
  status: UploadStatus;
  created_at: string;
  updated_at: string;
};

export class UploadsRepository {
  constructor(private readonly db: VaultDatabase) {}

  create(input: {
    uploadId: string;
    fileId: string;
    poolId?: string;
    vaultKeyId?: string;
    totalChunks: number;
    chunkSize: number;
    expectedEncryptedBytes: number;
    createdAt: string;
  }): void {
    this.db.run(
      `
        INSERT INTO uploads (
          id, file_id, pool_id, vault_key_id, total_chunks, chunk_size, expected_encrypted_bytes,
          received_chunks, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'pending', ?, ?)
      `,
      [
        input.uploadId,
        input.fileId,
        input.poolId ?? null,
        input.vaultKeyId ?? null,
        input.totalChunks,
        input.chunkSize,
        input.expectedEncryptedBytes,
        input.createdAt,
        input.createdAt
      ]
    );
  }

  find(uploadId: string): UploadRecord | undefined {
    const row = this.db.get<UploadRow>("SELECT * FROM uploads WHERE id = ?", [uploadId]);
    return row ? mapUpload(row) : undefined;
  }

  findByFileId(fileId: string): UploadRecord | undefined {
    const row = this.db.get<UploadRow>(
      "SELECT * FROM uploads WHERE file_id = ? ORDER BY created_at DESC LIMIT 1",
      [fileId]
    );
    return row ? mapUpload(row) : undefined;
  }

  markChunkReceived(uploadId: string, index: number, updatedAt: string): UploadRecord {
    const upload = this.find(uploadId);

    if (!upload) {
      throw new Error("Upload nao encontrado.");
    }

    const receivedChunks = [...new Set([...upload.receivedChunks, index])].sort((a, b) => a - b);
    const status: UploadStatus = receivedChunks.length === upload.totalChunks ? "completed" : "uploading";

    this.db.run(
      "UPDATE uploads SET received_chunks = ?, status = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(receivedChunks), status, updatedAt, uploadId]
    );

    return {
      ...upload,
      receivedChunks,
      status,
      updatedAt
    };
  }

  markCompleted(uploadId: string, updatedAt: string): void {
    this.db.run(
      "UPDATE uploads SET status = 'completed', updated_at = ? WHERE id = ?",
      [updatedAt, uploadId]
    );
  }

  deleteByFile(fileId: string): void {
    this.db.run("DELETE FROM uploads WHERE file_id = ?", [fileId]);
  }
}

function mapUpload(row: UploadRow): UploadRecord {
  return {
    id: row.id,
    fileId: row.file_id,
    poolId: row.pool_id ?? undefined,
    vaultKeyId: row.vault_key_id ?? undefined,
    totalChunks: row.total_chunks,
    chunkSize: row.chunk_size,
    expectedEncryptedBytes: row.expected_encrypted_bytes,
    receivedChunks: JSON.parse(row.received_chunks) as number[],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
