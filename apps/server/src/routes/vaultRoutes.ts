import type { FastifyInstance } from "fastify";
import type { VaultFileManifestResponse, VaultSettings, VaultStats } from "@kazvault/shared";
import type { FilesRepository } from "../repositories/filesRepository";
import type { UploadsRepository } from "../repositories/uploadsRepository";
import type { ChunksRepository } from "../repositories/chunksRepository";
import type { StorageService } from "../services/storageService";
import type { ServerConfig } from "../config/config";
import type { PairingService } from "../services/pairingService";
import type { LogService } from "../services/logService";
import type { StorageManagerModule } from "../modules/storage/storage.service";
import { requirePairToken } from "./auth";
import { saveStorageDirSetting } from "../config/config";
import { isAbsolute } from "node:path";
import { getAvailableOptimizers } from "../vault/optimizer/dependency-checker";

interface VaultRouteDeps {
  config: ServerConfig;
  filesRepository: FilesRepository;
  uploadsRepository: UploadsRepository;
  chunksRepository: ChunksRepository;
  storageManager: StorageManagerModule;
  storage: StorageService;
  pairingService: PairingService;
  log: LogService;
}

export async function registerVaultRoutes(app: FastifyInstance, deps: VaultRouteDeps): Promise<void> {
  const auth = requirePairToken(deps.pairingService);

  app.get("/api/vault/stats", { preHandler: auth }, async () => {
    const usedBytes = await deps.storage.getUsedBytes();
    const disk = await deps.storage.getDiskStats();
    const response: VaultStats = {
      storageDir: deps.storage.storageDir,
      limitBytes: deps.config.spaceLimitBytes,
      usedBytes,
      remainingBytes: Math.max(0, deps.config.spaceLimitBytes - usedBytes),
      diskTotalBytes: disk?.totalBytes,
      diskFreeBytes: disk?.freeBytes,
      diskUsedBytes: disk?.usedBytes,
      fileCount: deps.filesRepository.countCompleted()
    };

    return response;
  });

  app.get("/api/vault/settings", { preHandler: auth }, async () => {
    const response: VaultSettings = {
      storageDir: deps.storage.storageDir
    };

    return response;
  });

  app.get("/api/vault/optimizers", { preHandler: auth }, async () => {
    return {
      mode: "lossless-safe",
      minimumGainPercent: Number(process.env.MIN_OPTIMIZATION_GAIN_PERCENT ?? "2"),
      optimizers: await getAvailableOptimizers(),
      visualEconomyEnabled: false
    };
  });

  app.put<{ Body: Partial<VaultSettings> }>("/api/vault/settings", { preHandler: auth }, async (request, reply) => {
    const storageDir = request.body.storageDir?.trim();

    if (!storageDir) {
      return reply.code(400).send({ error: "INVALID_STORAGE_DIR", message: "Pasta de armazenamento ausente." });
    }

    if (!isAbsolute(storageDir)) {
      return reply.code(400).send({ error: "INVALID_STORAGE_DIR", message: "Use um caminho absoluto, como E:/cloudkz." });
    }

    try {
      await deps.storage.updateStorageDir(storageDir);
    } catch {
      return reply.code(400).send({ error: "INVALID_STORAGE_DIR", message: "Nao foi possivel criar ou acessar esta pasta." });
    }

    saveStorageDirSetting(deps.config.settingsPath, storageDir);
    await deps.log.info("vault_storage_dir_updated", { storageDir });

    const response: VaultSettings = {
      storageDir: deps.storage.storageDir
    };

    return response;
  });

  app.get("/api/files", { preHandler: auth }, async () => {
    return {
      files: deps.filesRepository.list().map((file) => ({
        ...file,
        uploadId: deps.uploadsRepository.findByFileId(file.id)?.id
      }))
    };
  });

  app.get<{ Params: { fileId: string } }>("/api/files/:fileId/manifest", { preHandler: auth }, async (request, reply) => {
    const file = deps.filesRepository.find(request.params.fileId);

    if (!file) {
      return reply.code(404).send({ error: "FILE_NOT_FOUND" });
    }

    if (file.status !== "completed") {
      return reply.code(409).send({ error: "FILE_NOT_COMPLETED" });
    }

    const upload = deps.uploadsRepository.findByFileId(file.id);
    const manifest = await deps.storage.readEncryptedManifest(file.id, file.storageDir);

    if (!upload || !manifest) {
      return reply.code(404).send({ error: "FILE_DOWNLOAD_DATA_NOT_FOUND" });
    }

    const response: VaultFileManifestResponse = {
      fileId: file.id,
      uploadId: upload.id,
      totalChunks: file.totalChunks,
      encryptedManifestBase64: manifest.toString("base64")
    };

    return response;
  });

  app.get<{ Params: { fileId: string; index: string } }>(
    "/api/files/:fileId/chunks/:index",
    { preHandler: auth },
    async (request, reply) => {
      const file = deps.filesRepository.find(request.params.fileId);
      const index = Number(request.params.index);

      if (!file || !Number.isInteger(index) || index < 0 || index >= file.totalChunks) {
        return reply.code(404).send({ error: "FILE_OR_CHUNK_NOT_FOUND" });
      }

      if (file.status !== "completed") {
        return reply.code(409).send({ error: "FILE_NOT_COMPLETED" });
      }

      const mapped = deps.chunksRepository.findFileChunk(file.id, index);
      const indexed = mapped ? deps.chunksRepository.findIndexedChunk(mapped.chunkHash) : undefined;
      const storagePoolChunk = mapped ? await deps.storageManager.chunks.readChunk(mapped.chunkHash) : undefined;
      const chunk = storagePoolChunk ?? (indexed
        ? await deps.storage.readEncryptedChunk(
            indexed.fileId,
            indexed.chunkIndex,
            deps.filesRepository.find(indexed.fileId)?.storageDir
          )
        : await deps.storage.readEncryptedChunk(file.id, index, file.storageDir));

      if (!chunk) {
        return reply.code(404).send({ error: "CHUNK_NOT_FOUND" });
      }

      return reply.header("content-type", "application/octet-stream").send(chunk);
    }
  );

  app.get("/api/vault/keyring", { preHandler: auth }, async (_request, reply) => {
    const keyring = await deps.storage.readKeyring();

    if (!keyring) {
      return reply.code(404).send({ error: "KEYRING_NOT_FOUND" });
    }

    return keyring;
  });

  app.put<{ Body: unknown }>("/api/vault/keyring", { preHandler: auth }, async (request, reply) => {
    const body = request.body;

    if (!isValidKeyringBody(body)) {
      return reply.code(400).send({ error: "INVALID_KEYRING" });
    }

    await deps.storage.writeKeyring(body);
    await deps.log.info("vault_keyring_saved");

    return {
      saved: true
    };
  });

  app.delete<{ Params: { fileId: string } }>("/api/files/:fileId", { preHandler: auth }, async (request, reply) => {
    const file = deps.filesRepository.find(request.params.fileId);

    if (!file) {
      return reply.code(404).send({ error: "FILE_NOT_FOUND" });
    }

    await deps.storage.deleteFile(file.id, file.storageDir);
    deps.chunksRepository.deleteByFile(file.id);
    deps.uploadsRepository.deleteByFile(file.id);
    deps.filesRepository.delete(file.id);
    await deps.log.info("file_deleted", { fileId: file.id });

    return {
      deleted: true,
      fileId: file.id
    };
  });
}

function isValidKeyringBody(value: unknown): value is {
  version: 1;
  kdf: "argon2id";
  recoverySaltBase64: string;
  wrappedMasterKeyWithRecoveryBase64: string;
  createdAt: string;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const input = value as Record<string, unknown>;

  return (
    input.version === 1 &&
    input.kdf === "argon2id" &&
    typeof input.recoverySaltBase64 === "string" &&
    typeof input.wrappedMasterKeyWithRecoveryBase64 === "string" &&
    typeof input.createdAt === "string"
  );
}
