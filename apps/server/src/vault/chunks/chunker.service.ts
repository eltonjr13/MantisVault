export function splitIntoChunks(bytes: Uint8Array, chunkSizeBytes = readChunkSizeBytes()): Uint8Array[] {
  const chunks: Uint8Array[] = [];

  for (let offset = 0; offset < bytes.byteLength; offset += chunkSizeBytes) {
    chunks.push(bytes.slice(offset, Math.min(offset + chunkSizeBytes, bytes.byteLength)));
  }

  return chunks.length > 0 ? chunks : [new Uint8Array()];
}

export function readChunkSizeBytes(): number {
  const value = Number(process.env.CHUNK_SIZE_MB ?? "8");
  const mb = Number.isFinite(value) && value > 0 ? value : 8;
  return mb * 1024 * 1024;
}
