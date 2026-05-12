import type { VaultDatabase } from "../db/database";

export interface ChunkIndexRecord {
  chunkHash: string;
  fileId: string;
  chunkIndex: number;
  sizeBytes: number;
  createdAt: string;
}

export interface FileChunkRecord {
  fileId: string;
  chunkIndex: number;
  chunkHash: string;
  deduplicated: boolean;
}

type ChunkIndexRow = {
  chunk_hash: string;
  file_id: string;
  chunk_index: number;
  size_bytes: number;
  created_at: string;
};

type FileChunkRow = {
  file_id: string;
  chunk_index: number;
  chunk_hash: string;
  deduplicated: number;
};

export class ChunksRepository {
  constructor(private readonly db: VaultDatabase) {}

  findIndexedChunk(chunkHash: string): ChunkIndexRecord | undefined {
    const row = this.db.get<ChunkIndexRow>("SELECT * FROM chunk_index WHERE chunk_hash = ?", [chunkHash]);
    return row ? mapChunkIndex(row) : undefined;
  }

  indexChunk(input: { chunkHash: string; fileId: string; chunkIndex: number; sizeBytes: number; createdAt: string }): void {
    this.db.run(
      `
        INSERT OR IGNORE INTO chunk_index (chunk_hash, file_id, chunk_index, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      [input.chunkHash, input.fileId, input.chunkIndex, input.sizeBytes, input.createdAt]
    );
  }

  mapFileChunk(input: { fileId: string; chunkIndex: number; chunkHash: string; deduplicated: boolean }): void {
    this.db.run(
      `
        INSERT OR REPLACE INTO file_chunks (file_id, chunk_index, chunk_hash, deduplicated)
        VALUES (?, ?, ?, ?)
      `,
      [input.fileId, input.chunkIndex, input.chunkHash, input.deduplicated ? 1 : 0]
    );
  }

  findFileChunk(fileId: string, chunkIndex: number): FileChunkRecord | undefined {
    const row = this.db.get<FileChunkRow>("SELECT * FROM file_chunks WHERE file_id = ? AND chunk_index = ?", [fileId, chunkIndex]);
    return row ? mapFileChunk(row) : undefined;
  }

  deleteByFile(fileId: string): void {
    this.db.run("DELETE FROM file_chunks WHERE file_id = ?", [fileId]);
  }
}

function mapChunkIndex(row: ChunkIndexRow): ChunkIndexRecord {
  return {
    chunkHash: row.chunk_hash,
    fileId: row.file_id,
    chunkIndex: row.chunk_index,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  };
}

function mapFileChunk(row: FileChunkRow): FileChunkRecord {
  return {
    fileId: row.file_id,
    chunkIndex: row.chunk_index,
    chunkHash: row.chunk_hash,
    deduplicated: row.deduplicated === 1
  };
}
