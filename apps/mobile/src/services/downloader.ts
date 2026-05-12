import { decompressBytes } from "@kazvault/compression";
import { decryptBytes, decryptJson } from "@kazvault/crypto";
import type { FileManifestPlaintext, PairPayload } from "@kazvault/shared";
import { downloadChunk, getFileManifest } from "./serverClient";

export interface DownloadProgressEvent {
  progress: number;
  detail: string;
}

export async function downloadAndRestoreFile(input: {
  fileId: string;
  pairing: PairPayload;
  masterKey: Uint8Array;
  onProgress: (event: DownloadProgressEvent) => void;
}): Promise<{ fileName: string; bytes: Uint8Array; mimeType: string }> {
  input.onProgress({ progress: 0.02, detail: "Baixando manifest" });

  const manifestEnvelope = await getFileManifest(input.pairing, input.fileId);
  const manifest = await decryptJson<FileManifestPlaintext>(
    manifestEnvelope.encryptedManifestBase64,
    input.masterKey,
    "kazvault:manifest"
  );
  const restoredChunks: Uint8Array[] = [];
  const compressedChunks: Uint8Array[] = [];
  let restoredSize = 0;
  let compressedSize = 0;
  const isWholeFileCompression = manifest.compressionScope !== "per-chunk";

  for (let index = 0; index < manifestEnvelope.totalChunks; index += 1) {
    input.onProgress({
      progress: 0.06 + (index / manifestEnvelope.totalChunks) * 0.86,
      detail: `Restaurando ${index + 1}/${manifestEnvelope.totalChunks}`
    });

    const encryptedChunk = await downloadChunk(input.pairing, input.fileId, index);
    const compressedChunk = await decryptBytes(
      encryptedChunk,
      input.masterKey,
      `kazvault:chunk:${manifestEnvelope.uploadId}:${index}`
    );

    if (isWholeFileCompression) {
      compressedChunks.push(compressedChunk);
      compressedSize += compressedChunk.byteLength;
    } else {
      const restoredChunk = await decompressBytes(compressedChunk, manifest.compressionAlgorithm);
      restoredChunks.push(restoredChunk);
      restoredSize += restoredChunk.byteLength;
    }

    await yieldToBrowser();
  }

  const bytes = isWholeFileCompression
    ? await decompressBytes(concatBytes(compressedChunks, compressedSize), manifest.compressionAlgorithm)
    : concatBytes(restoredChunks, restoredSize);

  if (bytes.byteLength !== manifest.originalSize) {
    throw new Error("Arquivo restaurado com tamanho inesperado.");
  }

  input.onProgress({ progress: 1, detail: "Arquivo pronto" });

  return {
    fileName: manifest.originalName || `kazvault-${input.fileId}`,
    bytes,
    mimeType: manifest.mimeType || "application/octet-stream"
  };
}

export function saveRestoredFile(fileName: string, bytes: Uint8Array, mimeType: string): void {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([body], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function concatBytes(chunks: Uint8Array[], totalSize: number): Uint8Array {
  const out = new Uint8Array(totalSize);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return out;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
