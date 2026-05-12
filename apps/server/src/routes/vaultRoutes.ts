import type { FastifyInstance } from "fastify";
import type { VaultStats } from "@kazvault/shared";
import type { FilesRepository } from "../repositories/filesRepository";
import type { UploadsRepository } from "../repositories/uploadsRepository";
import type { StorageService } from "../services/storageService";
import type { ServerConfig } from "../config/config";
import type { PairingService } from "../services/pairingService";
import type { LogService } from "../services/logService";
import { requirePairToken } from "./auth";

interface VaultRouteDeps {
  config: ServerConfig;
  filesRepository: FilesRepository;
  uploadsRepository: UploadsRepository;
  storage: StorageService;
  pairingService: PairingService;
  log: LogService;
}

export async function registerVaultRoutes(app: FastifyInstance, deps: VaultRouteDeps): Promise<void> {
  const auth = requirePairToken(deps.pairingService);

  app.get("/api/vault/stats", { preHandler: auth }, async () => {
    const usedBytes = await deps.storage.getUsedBytes();
    const response: VaultStats = {
      storageDir: deps.storage.storageDir,
      limitBytes: deps.config.spaceLimitBytes,
      usedBytes,
      remainingBytes: Math.max(0, deps.config.spaceLimitBytes - usedBytes),
      fileCount: deps.filesRepository.countCompleted()
    };

    return response;
  });

  app.get("/api/files", { preHandler: auth }, async () => {
    return {
      files: deps.filesRepository.list()
    };
  });

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

    await deps.storage.deleteFile(file.id);
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
