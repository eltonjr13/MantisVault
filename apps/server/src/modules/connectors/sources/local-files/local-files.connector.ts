import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, parse } from "node:path";
import type { ConnectorsRepository } from "../../connectors.repository";
import { ConnectorError } from "../../connectors.errors";
import type { ConnectorRecord, SyncOptions, SyncResult, VaultConnector } from "../../connectors.types";
import { FileNormalizer } from "../../normalizers/file.normalizer";
import type { VaultIngestService } from "../../../vault/ingest/vault-ingest.service";
import { sha256File } from "../../../../vault/chunks/hash.service";
import type { LocalFilesImportRequest } from "./local-files.types";

export class LocalFilesConnector implements VaultConnector {
  readonly type = "local-files" as const;
  private readonly normalizer = new FileNormalizer();

  constructor(
    private readonly repository: ConnectorsRepository,
    private readonly ingest: VaultIngestService
  ) {}

  async connect(input?: unknown): Promise<ConnectorRecord> {
    const body = (input ?? {}) as { name?: string };
    const now = new Date().toISOString();
    return this.repository.createConnector({
      id: randomUUID(),
      type: this.type,
      name: body.name ?? "Importacao local",
      status: "connected",
      createdAt: now
    });
  }

  async import(input: LocalFilesImportRequest, jobId = randomUUID()): Promise<SyncResult> {
    if (!Array.isArray(input.paths) || input.paths.length === 0) {
      throw new ConnectorError("INVALID_LOCAL_PATHS", "Informe pelo menos um caminho local.", 400);
    }

    const connector = await this.connect({ name: input.connectorName ?? "Importacao local" });
    let scanned = 0;
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let bytesImported = 0;
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const path of input.paths) {
      scanned += 1;

      try {
        const filePath = await assertSafeFilePath(path);
        const hash = await sha256File(filePath);
        const sourceId = `local:${hash}`;

        if (this.repository.findItem(connector.id, sourceId) || this.repository.findItemByHash(hash)) {
          skipped += 1;
          continue;
        }

        const result = await this.ingest.ingest(
          this.normalizer.toIngestSource({
            connectorId: connector.id,
            sourceId,
            fileName: basename(filePath),
            filePath
          })
        );
        this.repository.createItem({
          id: randomUUID(),
          connectorId: connector.id,
          sourceId,
          sourceType: "file",
          title: basename(filePath),
          originalSize: result.originalSize,
          originalHash: result.originalHash,
          storedFileId: result.storedFileId,
          manifestId: result.manifestId,
          importedAt: new Date().toISOString(),
          metadata: { localFirst: true, originalPathRoot: parse(filePath).root }
        });
        imported += 1;
        bytesImported += result.storedSize;
      } catch (error) {
        failed += 1;
        errors.push(error instanceof Error ? error.message : "Falha ao importar arquivo local.");
      }
    }

    return {
      connectorId: connector.id,
      jobId,
      status: failed > 0 && imported === 0 ? "failed" : "completed",
      scanned,
      imported,
      skipped,
      failed,
      bytesImported,
      warnings,
      errors
    };
  }

  async sync(connector: ConnectorRecord, _options: SyncOptions): Promise<SyncResult> {
    return {
      connectorId: connector.id,
      jobId: randomUUID(),
      status: "completed",
      scanned: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      bytesImported: 0,
      warnings: ["Local Files usa importacao manual por caminhos autorizados."],
      errors: []
    };
  }

  async disconnect(connectorId: string): Promise<void> {
    this.repository.updateConnector(connectorId, { status: "disconnected" });
  }
}

async function assertSafeFilePath(inputPath: string): Promise<string> {
  if (!inputPath || !isAbsolute(inputPath)) {
    throw new ConnectorError("INVALID_LOCAL_PATH", "Caminho local deve ser absoluto.", 400);
  }

  if (inputPath.includes("\0") || inputPath.includes("..")) {
    throw new ConnectorError("INVALID_LOCAL_PATH", "Caminho local recusado.", 400);
  }

  if (!existsSync(inputPath)) {
    throw new ConnectorError("LOCAL_FILE_NOT_FOUND", "Arquivo local nao encontrado.", 404);
  }

  const resolved = await realpath(inputPath);
  const fileStat = await stat(resolved);

  if (!fileStat.isFile()) {
    throw new ConnectorError("LOCAL_PATH_NOT_FILE", "Somente arquivos sao aceitos nesta importacao.", 400);
  }

  return resolved;
}
