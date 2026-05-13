import type { FastifyInstance } from "fastify";
import type { FilesRepository } from "../../repositories/filesRepository";
import type { ChunksRepository } from "../../repositories/chunksRepository";
import type { StorageService } from "../../services/storageService";
import type { LogService } from "../../services/logService";
import type { PairingService } from "../../services/pairingService";
import type { AuthSessionService } from "../../services/authSessionService";
import type { StorageManagerModule } from "../storage/storage.service";
import { requirePairToken } from "../../routes/auth";
import { ConnectorRegistry } from "./connectors.registry";
import { ConnectorsRepository } from "./connectors.repository";
import { ConnectorsService } from "./connectors.service";
import { sendConnectorError } from "./connectors.controller";
import type { ConnectorType, SyncResult } from "./connectors.types";
import { ConnectorKeyManager, TokenVaultService } from "./credentials/token-vault.service";
import { ConnectorCredentialsService } from "./credentials/connector-credentials.service";
import { VaultIngestService } from "../vault/ingest/vault-ingest.service";
import { LocalFilesConnector } from "./sources/local-files/local-files.connector";
import { AndroidFilesConnector } from "./sources/android-files/android-files.connector";
import { MobileContactsConnector } from "./sources/mobile-contacts/mobile-contacts.connector";
import { MobileCalendarConnector } from "./sources/mobile-calendar/mobile-calendar.connector";
import { GmailConnector } from "./sources/gmail/gmail.connector";
import { GmailOAuthService } from "./sources/gmail/gmail.oauth";
import { OutlookConnector } from "./sources/outlook/outlook.connector";
import { OutlookOAuthService } from "./sources/outlook/outlook.oauth";
import { ImapConnector } from "./sources/imap/imap.connector";
import { SyncProgressGateway } from "./sync/sync-progress.gateway";
import { SyncReportService } from "./sync/sync-report.service";
import { SyncJobService } from "./sync/sync-job.service";

interface ConnectorsRouteDeps {
  dbRepository: ConnectorsRepository;
  filesRepository: FilesRepository;
  chunksRepository: ChunksRepository;
  storageManager: StorageManagerModule;
  storage: StorageService;
  pairingService: PairingService;
  authSessionService?: AuthSessionService;
  log: LogService;
}

export async function registerConnectorsRoutes(app: FastifyInstance, deps: ConnectorsRouteDeps): Promise<void> {
  const auth = requirePairToken(deps.pairingService, deps.authSessionService);
  const module = buildConnectorsModule(deps);
  const {
    service,
    progress,
    syncJobs,
    localFiles,
    androidFiles,
    mobileContacts,
    mobileCalendar,
    gmail,
    outlook,
    imap
  } = module;

  app.get("/api/connectors", { preHandler: auth }, async (_request, reply) => {
    try {
      return { connectors: service.list() };
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.get("/api/connectors/capabilities", { preHandler: auth }, async (_request, reply) => {
    try {
      return { capabilities: service.capabilities() };
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.get<{ Params: { id: string } }>("/api/connectors/:id", { preHandler: auth }, async (request, reply) => {
    try {
      return service.get(request.params.id);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post<{ Params: { type: string }; Body: unknown }>("/api/connectors/:type/connect", { preHandler: auth }, async (request, reply) => {
    try {
      return service.connect(assertConnectorType(request.params.type), request.body);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post<{ Params: { id: string }; Body: unknown }>("/api/connectors/:id/sync", { preHandler: auth }, async (request, reply) => {
    try {
      return service.sync(request.params.id, (request.body ?? {}) as Record<string, unknown>);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.get<{ Params: { id: string } }>("/api/connectors/:id/items", { preHandler: auth }, async (request, reply) => {
    try {
      return { items: service.items(request.params.id) };
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.get<{ Params: { id: string } }>("/api/connectors/:id/status", { preHandler: auth }, async (request, reply) => {
    try {
      return service.status(request.params.id);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post<{ Params: { id: string }; Body: { deleteData?: boolean } }>("/api/connectors/:id/disconnect", { preHandler: auth }, async (request, reply) => {
    try {
      return service.disconnect(request.params.id, request.body?.deleteData === true);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.delete<{ Params: { id: string }; Body: { deleteData?: boolean } }>("/api/connectors/:id", { preHandler: auth }, async (request, reply) => {
    try {
      return service.delete(request.params.id, request.body?.deleteData === true);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.get<{ Params: { jobId: string } }>("/api/connectors/sync-jobs/:jobId", { preHandler: auth }, async (request, reply) => {
    try {
      return service.job(request.params.jobId);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.get<{ Params: { jobId: string } }>("/api/connectors/sync-jobs/:jobId/events", { preHandler: auth }, async (request, reply) => {
    progress.stream(request.params.jobId, reply);
  });

  app.post<{ Body: { paths: string[]; connectorName?: string } }>("/api/connectors/local-files/import", { preHandler: auth }, async (request, reply) => {
    try {
      return completeAdHoc(syncJobs, await localFiles.import(request.body));
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post<{ Body: { deviceId: string; fileName: string; mimeType?: string; size: number; relativePath?: string } }>(
    "/api/connectors/android-files/start",
    { preHandler: auth },
    async (request, reply) => {
      try {
        return androidFiles.start(request.body);
      } catch (error) {
        return sendConnectorError(reply, error);
      }
    }
  );

  app.post<{ Params: { uploadId: string } }>("/api/connectors/android-files/:uploadId/chunk", { preHandler: auth }, async (request, reply) => {
    try {
      const multipart = await readSingleMultipartFile(request);

      if (!multipart.file) {
        return reply.code(400).send({ error: "CHUNK_MISSING", message: "Chunk ausente." });
      }

      const chunkIndex = Number(multipart.fields.chunkIndex);
      const chunkHash = multipart.fields.chunkHash;
      return androidFiles.receiveChunk(request.params.uploadId, chunkIndex, multipart.file.buffer, chunkHash);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post<{ Params: { uploadId: string }; Body: { totalChunks: number; originalHash: string } }>(
    "/api/connectors/android-files/:uploadId/complete",
    { preHandler: auth },
    async (request, reply) => {
      try {
        return androidFiles.complete(request.params.uploadId, request.body);
      } catch (error) {
        return sendConnectorError(reply, error);
      }
    }
  );

  app.post("/api/connectors/mobile-contacts/import-vcf", { preHandler: auth }, async (request, reply) => {
    try {
      const multipart = await readSingleMultipartFile(request);

      if (!multipart.file) {
        return reply.code(400).send({ error: "VCF_MISSING", message: "Arquivo VCF ausente." });
      }

      return completeAdHoc(syncJobs, await mobileContacts.importVcf({
        file: multipart.file.buffer,
        fileName: multipart.file.filename,
        deviceId: multipart.fields.deviceId ?? ""
      }));
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post<{ Body: { deviceId: string; contacts: unknown[] } }>("/api/connectors/mobile-contacts/import-json", { preHandler: auth }, async (request, reply) => {
    try {
      return completeAdHoc(syncJobs, await mobileContacts.importJson(request.body as any));
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post("/api/connectors/mobile-calendar/import-ics", { preHandler: auth }, async (request, reply) => {
    try {
      const multipart = await readSingleMultipartFile(request);

      if (!multipart.file) {
        return reply.code(400).send({ error: "ICS_MISSING", message: "Arquivo ICS ausente." });
      }

      return completeAdHoc(syncJobs, await mobileCalendar.importIcs({
        file: multipart.file.buffer,
        fileName: multipart.file.filename,
        deviceId: multipart.fields.deviceId ?? ""
      }));
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post<{ Body: { deviceId: string; events: unknown[] } }>("/api/connectors/mobile-calendar/import-json", { preHandler: auth }, async (request, reply) => {
    try {
      return completeAdHoc(syncJobs, await mobileCalendar.importJson(request.body as any));
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post("/api/connectors/gmail/start", { preHandler: auth }, async (_request, reply) => {
    try {
      return gmail.startOAuth();
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.get<{ Querystring: { code?: string; state?: string } }>("/api/connectors/gmail/callback", async (request, reply) => {
    try {
      return gmail.completeOAuth(request.query.code, request.query.state);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post("/api/connectors/outlook/start", { preHandler: auth }, async (_request, reply) => {
    try {
      return outlook.startOAuth();
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.get<{ Querystring: { code?: string; state?: string } }>("/api/connectors/outlook/callback", async (request, reply) => {
    try {
      return outlook.completeOAuth(request.query.code, request.query.state);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });

  app.post<{ Body: unknown }>("/api/connectors/imap/connect", { preHandler: auth }, async (request, reply) => {
    try {
      return imap.connect(request.body);
    } catch (error) {
      return sendConnectorError(reply, error);
    }
  });
}

function buildConnectorsModule(deps: ConnectorsRouteDeps) {
  const registry = new ConnectorRegistry();
  const keyManager = new ConnectorKeyManager(deps.storage, deps.log);
  const tokenVault = new TokenVaultService(deps.storage, keyManager);
  const credentials = new ConnectorCredentialsService(deps.dbRepository, tokenVault);
  const ingest = new VaultIngestService(deps.storage, deps.filesRepository, deps.chunksRepository, keyManager, deps.storageManager);
  const progress = new SyncProgressGateway();
  const syncJobs = new SyncJobService(deps.dbRepository, progress, new SyncReportService());
  const service = new ConnectorsService(deps.dbRepository, registry, credentials, syncJobs);
  const localFiles = new LocalFilesConnector(deps.dbRepository, ingest);
  const androidFiles = new AndroidFilesConnector(deps.dbRepository, deps.storage, ingest);
  const mobileContacts = new MobileContactsConnector(deps.dbRepository, ingest);
  const mobileCalendar = new MobileCalendarConnector(deps.dbRepository, ingest);
  const gmail = new GmailConnector(deps.dbRepository, credentials, ingest, new GmailOAuthService());
  const outlook = new OutlookConnector(deps.dbRepository, credentials, new OutlookOAuthService());
  const imap = new ImapConnector(deps.dbRepository, credentials);

  [localFiles, androidFiles, mobileContacts, mobileCalendar, gmail, outlook, imap].forEach((connector) => registry.register(connector));

  return {
    service,
    progress,
    syncJobs,
    localFiles,
    androidFiles,
    mobileContacts,
    mobileCalendar,
    gmail,
    outlook,
    imap
  };
}

function completeAdHoc(syncJobs: SyncJobService, result: SyncResult): SyncResult {
  const job = syncJobs.start(result.connectorId);
  const next = { ...result, jobId: job.id };
  syncJobs.complete(next);
  return next;
}

function assertConnectorType(type: string): ConnectorType {
  const allowed = new Set([
    "local-files",
    "android-files",
    "mobile-contacts",
    "mobile-calendar",
    "gmail",
    "outlook",
    "imap",
    "manual-import"
  ]);

  if (!allowed.has(type)) {
    throw new Error("Tipo de conector invalido.");
  }

  return type as ConnectorType;
}

async function readSingleMultipartFile(request: {
  parts: () => AsyncIterable<any>;
}): Promise<{ fields: Record<string, string>; file?: { filename: string; buffer: Buffer } }> {
  const fields: Record<string, string> = {};
  let file: { filename: string; buffer: Buffer } | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      file = {
        filename: part.filename,
        buffer: await part.toBuffer()
      };
    } else if (part.fieldname) {
      fields[part.fieldname] = String(part.value ?? "");
    }
  }

  return { fields, file };
}
