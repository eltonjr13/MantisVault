import type { ConnectorRegistry } from "./connectors.registry";
import type { ConnectorsRepository } from "./connectors.repository";
import { ConnectorError } from "./connectors.errors";
import type {
  ConnectorCapability,
  ConnectorRecord,
  ConnectorType,
  SyncOptions,
  SyncResult
} from "./connectors.types";
import type { ConnectorCredentialsService } from "./credentials/connector-credentials.service";
import type { SyncJobService } from "./sync/sync-job.service";

export class ConnectorsService {
  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly registry: ConnectorRegistry,
    private readonly credentials: ConnectorCredentialsService,
    private readonly syncJobs: SyncJobService
  ) {}

  list(): ConnectorRecord[] {
    return this.repository.listConnectors().map(publicConnector);
  }

  get(id: string): ConnectorRecord {
    const connector = this.repository.findConnector(id);

    if (!connector) {
      throw new ConnectorError("CONNECTOR_NOT_FOUND", "Conector nao encontrado.", 404);
    }

    return publicConnector(connector);
  }

  items(id: string) {
    this.get(id);
    return this.repository.listItems(id);
  }

  status(id: string) {
    const connector = this.get(id);
    return {
      connector,
      lastSyncAt: connector.lastSyncAt,
      lastError: connector.lastError,
      itemsCount: this.repository.listItems(id).length
    };
  }

  async connect(type: ConnectorType, input?: unknown): Promise<ConnectorRecord> {
    const connector = this.registry.get(type);

    if (!connector.connect) {
      throw new ConnectorError("CONNECT_NOT_SUPPORTED", "Este conector nao usa connect generico.", 400);
    }

    return publicConnector(await connector.connect(input));
  }

  async sync(id: string, options: SyncOptions = {}): Promise<SyncResult> {
    const connector = this.requireConnector(id);
    const runtime = this.registry.get(connector.type);
    const job = this.syncJobs.start(id);
    this.repository.updateConnector(id, { status: "syncing", lastError: null });

    try {
      const result = await runtime.sync(connector, options);
      const normalized = { ...result, jobId: job.id };
      this.syncJobs.complete(normalized);
      this.repository.updateConnector(id, {
        status: normalized.status === "completed" ? "connected" : "error",
        syncCursor: normalized.nextCursor ?? connector.syncCursor ?? null,
        lastSyncAt: new Date().toISOString(),
        lastError: normalized.errors[0] ?? null
      });
      return normalized;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na sincronizacao.";
      const failed: SyncResult = {
        connectorId: id,
        jobId: job.id,
        status: "failed",
        scanned: 0,
        imported: 0,
        skipped: 0,
        failed: 1,
        bytesImported: 0,
        warnings: [],
        errors: [message]
      };
      this.syncJobs.complete(failed);
      this.repository.updateConnector(id, { status: "error", lastError: message });
      return failed;
    }
  }

  async disconnect(id: string, deleteData = false): Promise<{ disconnected: true; deleteData: boolean }> {
    const connector = this.requireConnector(id);
    await this.registry.get(connector.type).disconnect(id);
    await this.credentials.delete(id).catch(() => undefined);
    this.repository.updateConnector(id, { status: "disconnected", encryptedCredentialsRef: null });

    if (deleteData) {
      this.repository.softDeleteItems(id);
    }

    return { disconnected: true, deleteData };
  }

  async delete(id: string, deleteData = false): Promise<{ deleted: true; deleteData: boolean }> {
    await this.disconnect(id, deleteData);
    this.repository.deleteConnector(id);
    return { deleted: true, deleteData };
  }

  job(id: string) {
    const job = this.repository.findJob(id);

    if (!job) {
      throw new ConnectorError("SYNC_JOB_NOT_FOUND", "Job de sync nao encontrado.", 404);
    }

    return job;
  }

  capabilities(): ConnectorCapability[] {
    return [
      capability("local-files", "Importacao local", true),
      capability("android-files", "Arquivos do celular", true),
      capability("mobile-contacts", "Contatos", true),
      capability("mobile-calendar", "Calendario", true),
      capability("gmail", "Gmail", Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI), {
        GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
        GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        GOOGLE_REDIRECT_URI: Boolean(process.env.GOOGLE_REDIRECT_URI)
      }),
      capability("outlook", "Outlook", Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_REDIRECT_URI), {
        MICROSOFT_CLIENT_ID: Boolean(process.env.MICROSOFT_CLIENT_ID),
        MICROSOFT_CLIENT_SECRET: Boolean(process.env.MICROSOFT_CLIENT_SECRET),
        MICROSOFT_REDIRECT_URI: Boolean(process.env.MICROSOFT_REDIRECT_URI)
      }),
      capability("imap", "IMAP", true)
    ];
  }

  private requireConnector(id: string): ConnectorRecord {
    const connector = this.repository.findConnector(id);

    if (!connector) {
      throw new ConnectorError("CONNECTOR_NOT_FOUND", "Conector nao encontrado.", 404);
    }

    return connector;
  }
}

export function publicConnector(connector: ConnectorRecord): ConnectorRecord {
  const { encryptedCredentialsRef: _ref, ...safe } = connector;
  return safe;
}

function capability(
  type: ConnectorType,
  name: string,
  available: boolean,
  env?: Record<string, boolean>
): ConnectorCapability {
  return {
    type,
    name,
    available,
    localFirst: true,
    encryptedCredentials: true,
    env,
    notes: ["Use apenas fontes e arquivos autorizados.", "Nenhum dado e enviado para nuvem pelo MantisVault."]
  };
}
