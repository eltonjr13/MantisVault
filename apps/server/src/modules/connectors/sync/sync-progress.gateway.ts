import { EventEmitter } from "node:events";
import type { FastifyReply } from "fastify";
import type { SyncProgressEventName, SyncProgressPayload } from "./sync.types";

export class SyncProgressGateway {
  private readonly emitter = new EventEmitter();

  emit(event: SyncProgressEventName, payload: SyncProgressPayload): void {
    this.emitter.emit(payload.jobId, { event, payload });
  }

  stream(jobId: string, reply: FastifyReply): void {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });

    const listener = (message: { event: SyncProgressEventName; payload: SyncProgressPayload }) => {
      reply.raw.write(`event: ${message.event}\n`);
      reply.raw.write(`data: ${JSON.stringify(message.payload)}\n\n`);
    };

    this.emitter.on(jobId, listener);
    reply.raw.write(`event: connector.sync.progress\n`);
    reply.raw.write(`data: ${JSON.stringify({ jobId, message: "Aguardando eventos." })}\n\n`);
    reply.raw.on("close", () => this.emitter.off(jobId, listener));
  }
}
