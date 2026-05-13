import type { AuthSession } from "@kazvault/shared";
import type { FastifyInstance } from "fastify";
import type { AuthSessionService } from "../services/authSessionService";
import type { LogService } from "../services/logService";
import type { PairingService } from "../services/pairingService";
import { requirePairToken } from "./auth";

interface AuthSessionRouteDeps {
  authSessionService: AuthSessionService;
  pairingService: PairingService;
  log: LogService;
}

export async function registerAuthSessionRoutes(app: FastifyInstance, deps: AuthSessionRouteDeps): Promise<void> {
  app.post<{ Body: { pairToken?: string; token?: string; deviceName?: string } }>(
    "/api/auth/anonymous",
    async (request, reply) => {
      const pairToken = request.body?.pairToken ?? request.body?.token;
      const deviceName = request.body?.deviceName ?? "Celular";

      if (!deps.pairingService.confirm(pairToken, deviceName)) {
        return reply.code(401).send({
          error: "PAIRING_EXPIRED",
          message: "QR Code expirado ou invalido."
        });
      }

      const authSession = deps.authSessionService.createAnonymousSession({ deviceName });
      await deps.log.info("anonymous_session_created", { deviceName });

      return {
        confirmed: true,
        authSession
      };
    }
  );

  app.post<{ Body: { refreshToken?: string } }>("/api/auth/refresh", async (request, reply) => {
    const authSession = deps.authSessionService.refresh(request.body?.refreshToken);

    if (!authSession) {
      return reply.code(401).send({
        error: "REFRESH_EXPIRED",
        message: "Sessao expirada. Pareie o dispositivo novamente."
      });
    }

    return {
      authSession
    };
  });

  app.post<{ Body: { refreshToken?: string } }>("/api/auth/logout", async (request) => {
    return {
      revoked: deps.authSessionService.revoke(request.body?.refreshToken)
    };
  });

  app.get("/api/auth/session", { preHandler: requirePairToken(deps.pairingService, deps.authSessionService) }, async () => {
    const response: { active: true; sessionType: AuthSession["sessionType"] } = {
      active: true,
      sessionType: "anonymous"
    };

    return response;
  });
}
