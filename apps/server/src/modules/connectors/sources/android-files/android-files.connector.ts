import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { StorageService } from "../../../../services/storageService";
import type { ConnectorsRepository } from "../../connectors.repository";
import { ConnectorError } from "../../connectors.errors";
import type { ConnectorRecord, SyncOptions, SyncResult, VaultConnector } from "../../connectors.types";
import { FileNormalizer } from "../../normalizers/file.normalizer";
import type { VaultIngestService } from "../../../vault/ingest/vault-ingest.service";
import type { AndroidUploadSession, AndroidUploadStartRequest } from "./android-files.types";

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;

export class AndroidFilesConnector implements VaultConnector {
  readonly type = "android-files" as const;
  private readonly sessions = new Map<string, AndroidUploadSession>();
  private readonly normalizer = new FileNormalizer();

  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly storage: StorageService,
    private readonly ingest: VaultIngestService
  ) {}

  async connect(input?: unknown): Promise<ConnectorRecord> {
    const body = (input ?? {}) as { deviceId?: string; name?: string };
    return this.repository.createConnector({
      id: randomUUID(),
      type: this.type,
      name: body.name ?? "Arquivos Android",
      accountIdentifier: body.deviceId,
      status: "connected",
      createdAt: new Date().toISOString()
    });
  }

  async start(input: AndroidUploadStartRequest): Promise<{ uploadId: string; chunkSize: number }> {
    if (!input.deviceId || !input.fileName || !Number.isInteger(input.size) || input.size < 0) {
      throw new ConnectorError("INVALID_ANDROID_UPLOAD", "Payload de upload Android invalido.", 400);
    }

    const connector = await this.connect({ deviceId: input.deviceId });
    const uploadId = randomUUID();
    const tempDir = join(this.storage.storageDir, "android-upload-temp", uploadId);
    await mkdir(tempDir, { recursive: true });
    this.sessions.set(uploadId, {
      ...input,
      uploadId,
      connectorId: connector.id,
      tempDir,
      createdAt: new Date().toISOString()
    });
    return { uploadId, chunkSize: DEFAULT_CHUNK_SIZE };
  }

  async receiveChunk(uploadId: string, chunkIndex: number, chunk: Buffer, declaredHash?: string): Promise<{ uploadId: string; chunkIndex: number }> {
    const session = this.requireSession(uploadId);

    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunk.byteLength === 0) {
      throw new ConnectorError("INVALID_ANDROID_CHUNK", "Chunk invalido.", 400);
    }

    const actualHash = createHash("sha256").update(chunk).digest("hex");

    if (declaredHash && declaredHash !== actualHash) {
      throw new ConnectorError("ANDROID_CHUNK_HASH_MISMATCH", "Hash do chunk nao confere.", 400);
    }

    await writeFile(join(session.tempDir, `${chunkIndex}.part`), chunk);
    return { uploadId, chunkIndex };
  }

  async complete(uploadId: string, body: { totalChunks: number; originalHash: string }): Promise<{
    uploadId: string;
    connectorId: string;
    result: Awaited<ReturnType<VaultIngestService["ingest"]>>;
  }> {
    const session = this.requireSession(uploadId);
    const assembledPath = join(session.tempDir, "assembled.bin");

    if (!Number.isInteger(body.totalChunks) || body.totalChunks < 1 || !/^[a-f0-9]{64}$/i.test(body.originalHash)) {
      throw new ConnectorError("INVALID_ANDROID_COMPLETE", "Finalizacao de upload invalida.", 400);
    }

    const chunks: Buffer[] = [];

    for (let index = 0; index < body.totalChunks; index += 1) {
      chunks.push(await readFile(join(session.tempDir, `${index}.part`)));
    }

    await writeFile(assembledPath, Buffer.concat(chunks));
    const actualHash = await sha256Path(assembledPath);

    if (actualHash !== body.originalHash) {
      throw new ConnectorError("ANDROID_UPLOAD_HASH_MISMATCH", "Hash final nao confere.", 400);
    }

    const sourceId = `android:${session.deviceId}:${body.originalHash}`;
    const existing = this.repository.findItem(session.connectorId, sourceId) || this.repository.findItemByHash(body.originalHash);

    if (existing) {
      await rm(session.tempDir, { recursive: true, force: true });
      this.sessions.delete(uploadId);
      return {
        uploadId,
        connectorId: session.connectorId,
        result: {
          storedFileId: existing.storedFileId ?? "",
          manifestId: existing.manifestId ?? "",
          originalHash: body.originalHash,
          originalSize: existing.originalSize ?? session.size,
          storedSize: 0,
          savedBytes: 0,
          savedPercent: 0,
          encrypted: true,
          deduplicated: true
        }
      };
    }

    const result = await this.ingest.ingest(
      this.normalizer.toIngestSource({
        connectorId: session.connectorId,
        sourceId,
        sourceType: "file",
        fileName: basename(session.fileName),
        mimeType: session.mimeType,
        filePath: assembledPath,
        metadata: {
          deviceId: session.deviceId,
          relativePath: session.relativePath
        }
      })
    );
    this.repository.createItem({
      id: randomUUID(),
      connectorId: session.connectorId,
      sourceId,
      sourceType: "file",
      title: basename(session.fileName),
      mimeType: session.mimeType,
      originalSize: result.originalSize,
      originalHash: result.originalHash,
      storedFileId: result.storedFileId,
      manifestId: result.manifestId,
      importedAt: new Date().toISOString(),
      metadata: { deviceId: session.deviceId, relativePath: session.relativePath }
    });
    await rm(session.tempDir, { recursive: true, force: true });
    this.sessions.delete(uploadId);
    return { uploadId, connectorId: session.connectorId, result };
  }

  async sync(connector: ConnectorRecord, _options: SyncOptions): Promise<SyncResult> {
    return {
      connectorId: connector.id,
      jobId: randomUUID(),
      status: "completed",
      scanned: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      bytesImported: 0,
      warnings: ["Android Files recebe uploads autorizados pelo app mobile."],
      errors: []
    };
  }

  async disconnect(connectorId: string): Promise<void> {
    this.repository.updateConnector(connectorId, { status: "disconnected" });
  }

  private requireSession(uploadId: string): AndroidUploadSession {
    const session = this.sessions.get(uploadId);

    if (!session) {
      throw new ConnectorError("ANDROID_UPLOAD_NOT_FOUND", "Upload Android nao encontrado.", 404);
    }

    return session;
  }
}

function sha256Path(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
