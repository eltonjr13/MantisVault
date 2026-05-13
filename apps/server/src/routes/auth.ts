import type { FastifyReply, FastifyRequest } from "fastify";
import type { PairingService } from "../services/pairingService";
import type { AuthSessionService } from "../services/authSessionService";

export function requirePairToken(pairingService: PairingService, authSessionService?: AuthSessionService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const value = readAuthHeader(request);

    if (authSessionService?.verifyAccessToken(value) || pairingService.verify(value)) {
      return;
    }

    await reply.code(401).send({
      error: "SESSION_REQUIRED",
      message: "Sessao ausente, invalida ou expirada."
    });
  };
}

function readAuthHeader(request: FastifyRequest): string | undefined {
  const legacyToken = request.headers["x-kazvault-token"];
  const token = Array.isArray(legacyToken) ? legacyToken[0] : legacyToken;

  if (token) {
    return token;
  }

  const authorization = request.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;

  if (!value?.startsWith("Bearer ")) {
    return undefined;
  }

  return value.slice("Bearer ".length).trim();
}
