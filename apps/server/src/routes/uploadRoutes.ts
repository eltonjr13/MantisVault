import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type {
  UploadChunkResponse,
  UploadCompleteResponse,
  UploadInitRequest,
  UploadInitResponse
} from "@kazvault/shared";
import type { FilesRepository } from "../repositories/filesRepository";
import type { UploadsRepository } from "../repositories/uploadsRepository";
import type { StorageService } from "../services/storageService";
import type { LogService } from "../services/logService";
import type { ServerConfig } from "../config/config";
import type { PairingService } from "../services/pairingService";
import { requirePairToken } from "./auth";
import { sha256Hex } from "../utils/hash";

interface UploadRouteDeps {
  config: ServerConfig;
  filesRepository: FilesRepository;
  uploadsRepository: UploadsRepository;
  storage: StorageService;
  pairingService: PairingService;
  log: LogService;
}

export async function registerUploadRoutes(app: FastifyInstance, deps: UploadRouteDeps): Promise<void> {
  const auth = requirePairToken(deps.pairingService);

  app.post<{ Body: UploadInitRequest }>("/api/uploads/init", { preHandler: auth }, async (request, reply) => {
    const body = request.body;
    const validationError = validateInit(body);

    if (validationError) {
      return reply.code(400).send({ error: "INVALID_UPLOAD_INIT", message: validationError });
    }

    const manifestBytes = Buffer.from(body.encryptedManifestBase64, "base64");
    const actualManifestHash = sha256Hex(manifestBytes);

    if (actualManifestHash !== body.manifestSha256) {
      return reply.code(400).send({ error: "MANIFEST_HASH_MISMATCH" });
    }

    const usedBytes = await deps.storage.getUsedBytes();

    if (usedBytes + body.expectedEncryptedBytes > deps.config.spaceLimitBytes) {
      return reply.code(413).send({
        error: "VAULT_LIMIT_EXCEEDED",
        usedBytes,
        limitBytes: deps.config.spaceLimitBytes
      });
    }

    const now = new Date().toISOString();
    const fileId = randomUUID();
    const uploadId = randomUUID();

    await deps.storage.writeEncryptedManifest(fileId, manifestBytes);
    deps.filesRepository.createPending({
      fileId,
      totalChunks: body.totalChunks,
      encryptedBytes: body.expectedEncryptedBytes,
      manifestSha256: body.manifestSha256,
      createdAt: now
    });
    deps.uploadsRepository.create({
      uploadId,
      fileId,
      totalChunks: body.totalChunks,
      chunkSize: body.chunkSize,
      expectedEncryptedBytes: body.expectedEncryptedBytes,
      createdAt: now
    });

    await deps.log.info("upload_initialized", {
      uploadId,
      fileId,
      totalChunks: body.totalChunks,
      expectedEncryptedBytes: body.expectedEncryptedBytes
    });

    const response: UploadInitResponse = {
      uploadId,
      fileId,
      receivedChunks: []
    };

    return response;
  });

  app.patch<{ Params: { uploadId: string; index: string }; Body: Buffer }>(
    "/api/uploads/:uploadId/chunk/:index",
    { preHandler: auth, bodyLimit: 32 * 1024 * 1024 },
    async (request, reply) => {
      const upload = deps.uploadsRepository.find(request.params.uploadId);
      const index = Number(request.params.index);

      if (!upload || !Number.isInteger(index) || index < 0 || index >= upload.totalChunks) {
        return reply.code(404).send({ error: "UPLOAD_OR_CHUNK_NOT_FOUND" });
      }

      const body = request.body;

      if (!Buffer.isBuffer(body) || body.byteLength === 0) {
        return reply.code(400).send({ error: "EMPTY_CHUNK" });
      }

      const declaredHash = request.headers["x-chunk-sha256"];
      const actualHash = sha256Hex(body);

      if (typeof declaredHash === "string" && declaredHash !== actualHash) {
        return reply.code(400).send({ error: "CHUNK_HASH_MISMATCH" });
      }

      await deps.storage.writeEncryptedChunk(upload.fileId, index, body);
      const updated = deps.uploadsRepository.markChunkReceived(upload.id, index, new Date().toISOString());

      const response: UploadChunkResponse = {
        uploadId: upload.id,
        index,
        receivedChunks: updated.receivedChunks
      };

      return response;
    }
  );

  app.post<{ Params: { uploadId: string } }>(
    "/api/uploads/:uploadId/complete",
    { preHandler: auth },
    async (request, reply) => {
      const upload = deps.uploadsRepository.find(request.params.uploadId);

      if (!upload) {
        return reply.code(404).send({ error: "UPLOAD_NOT_FOUND" });
      }

      const missingChunks: number[] = [];

      for (let index = 0; index < upload.totalChunks; index += 1) {
        if (!(await deps.storage.chunkExists(upload.fileId, index))) {
          missingChunks.push(index);
        }
      }

      if (missingChunks.length > 0) {
        return reply.code(409).send({
          error: "UPLOAD_INCOMPLETE",
          missingChunks
        });
      }

      const completedAt = new Date().toISOString();
      deps.uploadsRepository.markCompleted(upload.id, completedAt);
      deps.filesRepository.markCompleted(upload.fileId, completedAt);
      await deps.log.info("upload_completed", { uploadId: upload.id, fileId: upload.fileId });

      const response: UploadCompleteResponse = {
        uploadId: upload.id,
        fileId: upload.fileId,
        status: "completed"
      };

      return response;
    }
  );
}

function validateInit(body: UploadInitRequest | undefined): string | undefined {
  if (!body || typeof body !== "object") {
    return "Payload ausente.";
  }

  if (!body.encryptedManifestBase64 || typeof body.encryptedManifestBase64 !== "string") {
    return "Manifest criptografado ausente.";
  }

  if (!/^[a-f0-9]{64}$/i.test(body.manifestSha256)) {
    return "SHA-256 do manifest invalido.";
  }

  if (!Number.isInteger(body.totalChunks) || body.totalChunks < 1) {
    return "Quantidade de chunks invalida.";
  }

  if (!Number.isInteger(body.chunkSize) || body.chunkSize < 1024 * 1024) {
    return "Tamanho de chunk invalido.";
  }

  if (!Number.isInteger(body.expectedEncryptedBytes) || body.expectedEncryptedBytes < body.totalChunks) {
    return "Tamanho esperado invalido.";
  }

  return undefined;
}
