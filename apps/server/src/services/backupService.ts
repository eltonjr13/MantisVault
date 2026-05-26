import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, parse } from "node:path";
import { VaultDatabase } from "../db/database";
import { BackupSource, BackupSourcesRepository } from "../repositories/backupSourcesRepository";
import { ConnectorsRepository } from "../modules/connectors/connectors.repository";
import { VaultIngestService } from "../modules/vault/ingest/vault-ingest.service";
import { FileNormalizer } from "../modules/connectors/normalizers/file.normalizer";
import { sha256File } from "../vault/chunks/hash.service";

export class BackupService {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private readonly normalizer = new FileNormalizer();

  constructor(
    private readonly repository: BackupSourcesRepository,
    private readonly connectorsRepository: ConnectorsRepository,
    private readonly ingest: VaultIngestService,
    private readonly db: VaultDatabase
  ) {}

  list(): BackupSource[] {
    return this.repository.list();
  }

  get(id: string): BackupSource | undefined {
    return this.repository.find(id);
  }

  create(input: {
    name: string;
    type: string;
    path?: string;
    syncInterval: string;
    enabled: boolean;
  }): BackupSource {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Re-use or insert a placeholder in the connectors table so the foreign key to connector_items is satisfied
    this.db.run(
      `
        INSERT INTO connectors (id, type, name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id, "local-files", input.name, "connected", now, now]
    );

    const source = this.repository.create({
      id,
      name: input.name,
      type: input.type,
      path: input.path,
      syncInterval: input.syncInterval,
      enabled: input.enabled,
      status: "idle",
      lastSyncAt: undefined,
      nextSyncAt: calculateNextSync(input.syncInterval) ?? undefined,
      protectedFilesCount: 0,
      errorsCount: 0,
      recentErrors: []
    });

    return source;
  }

  update(id: string, patch: Partial<Omit<BackupSource, "id" | "createdAt" | "updatedAt">>): BackupSource | undefined {
    const current = this.repository.find(id);
    if (!current) return undefined;

    // Update the connectors table as well to keep names in sync
    if (patch.name !== undefined) {
      this.db.run("UPDATE connectors SET name = ?, updated_at = ? WHERE id = ?", [
        patch.name,
        new Date().toISOString(),
        id
      ]);
    }

    let nextSyncAt = current.nextSyncAt;
    if (patch.syncInterval !== undefined || patch.enabled !== undefined) {
      const isEnabled = patch.enabled !== undefined ? patch.enabled : current.enabled;
      const interval = patch.syncInterval !== undefined ? patch.syncInterval : current.syncInterval;
      nextSyncAt = isEnabled ? (calculateNextSync(interval) ?? undefined) : undefined;
    }

    return this.repository.update(id, {
      ...patch,
      nextSyncAt
    });
  }

  delete(id: string): void {
    this.db.run("DELETE FROM connector_items WHERE connector_id = ?", [id]);
    this.db.run("DELETE FROM connector_sync_jobs WHERE connector_id = ?", [id]);
    this.db.run("DELETE FROM connectors WHERE id = ?", [id]);
    this.repository.delete(id);
  }

  async sync(id: string): Promise<BackupSource | undefined> {
    const source = this.repository.find(id);
    if (!source) return undefined;

    this.repository.update(id, { status: "syncing" });

    let errorsCount = 0;
    const recentErrors: string[] = [];
    let scanned = 0;
    let imported = 0;
    let skipped = 0;

    try {
      if (source.type === "local-folder") {
        if (!source.path) {
          throw new Error("Caminho local nao configurado.");
        }
        const resolvedDir = await assertSafeDirPath(source.path);
        const files = await getAllFiles(resolvedDir);

        for (const filePath of files) {
          scanned += 1;
          try {
            const fileStat = await stat(filePath);
            const hash = await sha256File(filePath);
            const sourceId = `backup:${filePath}`;

            const existingItem = this.connectorsRepository.findItem(id, sourceId);
            if (existingItem && existingItem.originalHash === hash) {
              skipped += 1;
              continue;
            }

            // Check if content hash is already protected in the system
            const duplicateItem = this.connectorsRepository.findItemByHash(hash);
            if (duplicateItem) {
              if (existingItem) {
                this.db.run(
                  `
                    UPDATE connector_items
                    SET original_hash = ?, original_size = ?, stored_file_id = ?, manifest_id = ?, updated_at = ?
                    WHERE connector_id = ? AND source_id = ?
                  `,
                  [
                    hash,
                    fileStat.size,
                    duplicateItem.storedFileId ?? null,
                    duplicateItem.manifestId ?? null,
                    new Date().toISOString(),
                    id,
                    sourceId
                  ]
                );
              } else {
                this.connectorsRepository.createItem({
                  id: randomUUID(),
                  connectorId: id,
                  sourceId,
                  sourceType: "file",
                  title: basename(filePath),
                  originalSize: fileStat.size,
                  originalHash: hash,
                  storedFileId: duplicateItem.storedFileId,
                  manifestId: duplicateItem.manifestId,
                  importedAt: new Date().toISOString(),
                  metadata: { localFirst: true, originalPathRoot: parse(filePath).root }
                });
              }
              skipped += 1;
              continue;
            }

            // Ingest new/modified file content
            const ingestResult = await this.ingest.ingest(
              this.normalizer.toIngestSource({
                connectorId: id,
                sourceId,
                fileName: basename(filePath),
                filePath
              })
            );

            if (existingItem) {
              this.db.run(
                `
                  UPDATE connector_items
                  SET original_hash = ?, original_size = ?, stored_file_id = ?, manifest_id = ?, updated_at = ?
                  WHERE connector_id = ? AND source_id = ?
                `,
                [
                  ingestResult.originalHash,
                  ingestResult.originalSize,
                  ingestResult.storedFileId,
                  ingestResult.manifestId,
                  new Date().toISOString(),
                  id,
                  sourceId
                ]
              );
            } else {
              this.connectorsRepository.createItem({
                id: randomUUID(),
                connectorId: id,
                sourceId,
                sourceType: "file",
                title: basename(filePath),
                originalSize: ingestResult.originalSize,
                originalHash: ingestResult.originalHash,
                storedFileId: ingestResult.storedFileId,
                manifestId: ingestResult.manifestId,
                importedAt: new Date().toISOString(),
                metadata: { localFirst: true, originalPathRoot: parse(filePath).root }
              });
            }
            imported += 1;
          } catch (fileErr) {
            errorsCount += 1;
            const msg = fileErr instanceof Error ? fileErr.message : "Erro desconhecido no arquivo.";
            recentErrors.unshift(`${basename(filePath)}: ${msg}`);
          }
        }
      } else {
        // For other types (android-files or connector)
        // Note: For non-local-folder, periodic server sync is skipped or doesn't pull files.
        // It updates the sync state.
        scanned = 0;
      }
    } catch (err) {
      errorsCount += 1;
      const msg = err instanceof Error ? err.message : "Erro na sincronizacao.";
      recentErrors.unshift(msg);
    }

    const itemsCount = this.connectorsRepository.listItems(id).length;
    const finalStatus = errorsCount > 0 ? "error" : "idle";
    const nextSyncAt = calculateNextSync(source.syncInterval);

    return this.repository.update(id, {
      status: finalStatus,
      lastSyncAt: new Date().toISOString(),
      nextSyncAt: nextSyncAt ?? undefined,
      protectedFilesCount: itemsCount,
      errorsCount: errorsCount,
      recentErrors: recentErrors.slice(0, 5)
    });
  }

  startScheduler(intervalMs = 10000): void {
    if (this.schedulerInterval) return;

    this.schedulerInterval = setInterval(() => {
      void this.runDueBackups();
    }, intervalMs);
  }

  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  private async runDueBackups(): Promise<void> {
    const now = new Date().toISOString();
    const due = this.repository.listDue(now);
    for (const source of due) {
      try {
        await this.sync(source.id);
      } catch (err) {
        // Suppress background errors
      }
    }
  }
}

async function assertSafeDirPath(inputPath: string): Promise<string> {
  if (!inputPath || !isAbsolute(inputPath)) {
    throw new Error("Caminho local deve ser absoluto.");
  }

  if (inputPath.includes("\0") || inputPath.includes("..")) {
    throw new Error("Caminho local recusado.");
  }

  if (!existsSync(inputPath)) {
    throw new Error("Pasta local nao encontrada.");
  }

  const resolved = await realpath(inputPath);
  const dirStat = await stat(resolved);

  if (!dirStat.isDirectory()) {
    throw new Error("O caminho especificado nao e uma pasta.");
  }

  return resolved;
}

async function getAllFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await getAllFiles(fullPath)));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Return whatever was collected
  }
  return files;
}

function calculateNextSync(interval: string, baseDate = new Date()): string | null {
  if (!interval || interval === "manual") return null;
  const time = baseDate.getTime();
  let offset = 0;
  if (interval === "15 min" || interval === "15m") {
    offset = 15 * 60 * 1000;
  } else if (interval === "1h") {
    offset = 60 * 60 * 1000;
  } else if (interval === "6h") {
    offset = 6 * 60 * 60 * 1000;
  } else if (interval === "diário" || interval === "daily") {
    offset = 24 * 60 * 60 * 1000;
  } else {
    return null;
  }
  return new Date(time + offset).toISOString();
}
