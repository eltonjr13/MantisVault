import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { VaultDatabase } = require("../dist/db/database.js");
const { ConnectorsRepository } = require("../dist/modules/connectors/connectors.repository.js");
const { BackupSourcesRepository } = require("../dist/repositories/backupSourcesRepository.js");
const { BackupService } = require("../dist/services/backupService.js");

test("Backup automatico - Fluxo completo", async (t) => {
  await withBackupRepo(async ({ dir, repository, connectorsRepository, db }) => {
    // 1. Criacao de fonte automatica
    const service = new BackupService(repository, connectorsRepository, fakeIngest(), db);

    const source = service.create({
      name: "Cofre Teste",
      type: "local-folder",
      path: join(dir, "my-backup-dir"),
      syncInterval: "1h",
      enabled: true
    });

    assert.ok(source.id);
    assert.equal(source.name, "Cofre Teste");
    assert.equal(source.type, "local-folder");
    assert.equal(source.syncInterval, "1h");
    assert.equal(source.enabled, true);
    assert.equal(source.status, "idle");
    assert.equal(source.protectedFilesCount, 0);
    assert.equal(source.errorsCount, 0);

    // 2. Registrar erro quando pasta nao existe
    let updated = await service.sync(source.id);
    assert.equal(updated.status, "error");
    assert.ok(updated.errorsCount > 0);
    assert.ok(updated.recentErrors.length > 0);
    assert.match(updated.recentErrors[0], /Pasta local nao encontrada/);
    assert.ok(updated.lastSyncAt);

    // Create the directory and a test file
    const backupDir = join(dir, "my-backup-dir");
    await mkdir(backupDir, { recursive: true });
    const file1 = join(backupDir, "file1.txt");
    await writeFile(file1, "conteudo original 1");

    // 3. Execucao manual de sync
    updated = await service.sync(source.id);
    assert.equal(updated.status, "idle");
    assert.equal(updated.errorsCount, 0);
    assert.equal(updated.protectedFilesCount, 1);

    // Check that the connector item was created
    const items = connectorsRepository.listItems(source.id);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "file1.txt");

    // 4. Nao duplicar arquivo inalterado
    const secondSync = await service.sync(source.id);
    assert.equal(secondSync.protectedFilesCount, 1);
    assert.equal(connectorsRepository.listItems(source.id).length, 1);

    // If we add another file, it should be protected:
    const file2 = join(backupDir, "file2.txt");
    await writeFile(file2, "conteudo original 2");
    const thirdSync = await service.sync(source.id);
    assert.equal(thirdSync.protectedFilesCount, 2);
    assert.equal(connectorsRepository.listItems(source.id).length, 2);
  });
});

async function withBackupRepo(callback) {
  const dir = await mkdtemp(join(tmpdir(), "kazvault-backup-"));
  const db = new VaultDatabase(join(dir, ".kazvault", "kazvault.sqlite"));
  await db.init();
  const repository = new BackupSourcesRepository(db);
  const connectorsRepository = new ConnectorsRepository(db);

  try {
    await callback({ dir, repository, connectorsRepository, db });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeIngest() {
  return {
    calls: [],
    async ingest(source) {
      this.calls.push(source);
      const buffer = source.buffer ?? await readFile(source.filePath);
      return {
        storedFileId: `file-${this.calls.length}`,
        manifestId: `file-${this.calls.length}`,
        originalHash: sha256(buffer),
        originalSize: buffer.byteLength,
        storedSize: buffer.byteLength,
        savedBytes: 0,
        savedPercent: 0,
        encrypted: true,
        deduplicated: false
      };
    }
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
