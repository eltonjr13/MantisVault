import type { FastifyInstance } from "fastify";
import type { BackupService } from "../services/backupService";
import type { PairingService } from "../services/pairingService";
import type { AuthSessionService } from "../services/authSessionService";
import { requirePairToken } from "./auth";

interface BackupRoutesDeps {
  backupService: BackupService;
  pairingService: PairingService;
  authSessionService?: AuthSessionService;
}

export async function registerBackupRoutes(app: FastifyInstance, deps: BackupRoutesDeps): Promise<void> {
  const auth = requirePairToken(deps.pairingService, deps.authSessionService);

  app.get("/api/backup/sources", { preHandler: auth }, async () => {
    return { sources: deps.backupService.list() };
  });

  app.post<{
    Body: {
      name: string;
      type: string;
      path?: string;
      syncInterval: string;
      enabled: boolean;
    };
  }>("/api/backup/sources", { preHandler: auth }, async (request, reply) => {
    const { name, type, syncInterval, path, enabled } = request.body;
    if (!name || !type || !syncInterval) {
      return reply.code(400).send({
        error: "INVALID_INPUT",
        message: "Nome, tipo e intervalo sao obrigatorios."
      });
    }
    const source = deps.backupService.create({ name, type, path, syncInterval, enabled });
    return source;
  });

  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      type?: string;
      path?: string;
      syncInterval?: string;
      enabled?: boolean;
      status?: "idle" | "syncing" | "error";
      lastSyncAt?: string;
      nextSyncAt?: string;
      protectedFilesCount?: number;
      errorsCount?: number;
      recentErrors?: string[];
    };
  }>("/api/backup/sources/:id", { preHandler: auth }, async (request, reply) => {
    const updated = deps.backupService.update(request.params.id, request.body);
    if (!updated) {
      return reply.code(404).send({
        error: "NOT_FOUND",
        message: "Fonte de backup nao encontrada."
      });
    }
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/backup/sources/:id", { preHandler: auth }, async (request) => {
    deps.backupService.delete(request.params.id);
    return { success: true };
  });

  app.post<{ Params: { id: string } }>("/api/backup/sources/:id/sync", { preHandler: auth }, async (request, reply) => {
    const source = deps.backupService.get(request.params.id);
    if (!source) {
      return reply.code(404).send({
        error: "NOT_FOUND",
        message: "Fonte de backup nao encontrada."
      });
    }
    const result = await deps.backupService.sync(request.params.id);
    return result;
  });
}
