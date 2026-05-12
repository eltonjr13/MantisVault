export interface ChunkIndexEntry {
  chunkHash: string;
  encryptedPath: string;
  sizeBytes: number;
  createdAt: string;
}

export class ChunkIndexService {
  private readonly entries = new Map<string, ChunkIndexEntry>();

  find(chunkHash: string): ChunkIndexEntry | undefined {
    return this.entries.get(chunkHash);
  }

  upsert(entry: Omit<ChunkIndexEntry, "createdAt">): ChunkIndexEntry {
    const next = {
      ...entry,
      createdAt: new Date().toISOString()
    };
    this.entries.set(entry.chunkHash, next);
    return next;
  }
}
