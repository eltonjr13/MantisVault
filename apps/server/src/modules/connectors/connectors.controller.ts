import type { FastifyReply } from "fastify";
import { asConnectorError } from "./connectors.errors";

export function sendConnectorError(reply: FastifyReply, error: unknown): void {
  const connectorError = asConnectorError(error);
  reply.code(connectorError.statusCode).send({
    error: connectorError.code,
    message: connectorError.message
  });
}
