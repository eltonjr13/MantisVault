import type { FastifyReply, FastifyRequest } from "fastify";
import type { PairingService } from "../services/pairingService";

export function requirePairToken(pairingService: PairingService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.headers["x-kazvault-token"];
    const value = Array.isArray(token) ? token[0] : token;

    if (!pairingService.verify(value)) {
      await reply.code(401).send({
        error: "PAIRING_REQUIRED",
        message: "Token de pareamento ausente, invalido ou expirado."
      });
    }
  };
}
