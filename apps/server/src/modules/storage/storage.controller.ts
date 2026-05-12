import type { FastifyReply } from "fastify";
import { asStorageError } from "./storage.errors";

export function sendStorageError(reply: FastifyReply, error: unknown): void {
  const storageError = asStorageError(error);
  reply.code(storageError.statusCode).send({
    error: {
      code: storageError.code,
      message: storageError.message,
      details: storageError.details
    }
  });
}
