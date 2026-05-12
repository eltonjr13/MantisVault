import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { VaultDatabase } = require("../dist/db/database.js");
const { ConnectorsRepository } = require("../dist/modules/connectors/connectors.repository.js");
const { ConnectorRegistry } = require("../dist/modules/connectors/connectors.registry.js");
const { ConnectorCredentialsService } = require("../dist/modules/connectors/credentials/connector-credentials.service.js");
const { ConnectorKeyManager, TokenVaultService } = require("../dist/modules/connectors/credentials/token-vault.service.js");
const { LocalFilesConnector } = require("../dist/modules/connectors/sources/local-files/local-files.connector.js");
const { AndroidFilesConnector } = require("../dist/modules/connectors/sources/android-files/android-files.connector.js");
const { MobileContactsConnector } = require("../dist/modules/connectors/sources/mobile-contacts/mobile-contacts.connector.js");
const { MobileCalendarConnector } = require("../dist/modules/connectors/sources/mobile-calendar/mobile-calendar.connector.js");
const { ImapConnector } = require("../dist/modules/connectors/sources/imap/imap.connector.js");
const { GmailOAuthService } = require("../dist/modules/connectors/sources/gmail/gmail.oauth.js");
const { publicConnector } = require("../dist/modules/connectors/connectors.service.js");

test("ConnectorRegistry registra, lista e falha com erro controlado", () => {
  const registry = new ConnectorRegistry();
  const connector = {
    type: "local-files",
    sync: async () => ({}),
    disconnect: async () => {}
  };

  registry.register(connector);
  assert.equal(registry.has("local-files"), true);
  assert.equal(registry.get("local-files"), connector);
  assert.equal(registry.list().length, 1);
  assert.throws(() => registry.get("gmail"), /nao registrado/);
});

test("ConnectorCredentialsService criptografa e nao salva token puro", async () => {
  await withRepo(async ({ dir, repository, storage, log }) => {
    const connector = repository.createConnector({
      id: "connector-1",
      type: "gmail",
      name: "Gmail",
      status: "connected",
      createdAt: new Date().toISOString()
    });
    const service = new ConnectorCredentialsService(
      repository,
      new TokenVaultService(storage, new ConnectorKeyManager(storage, log))
    );
    const secret = { refresh_token: "refresh-secret", appPassword: "mail-secret" };
    const ref = await service.save(connector.id, secret);

    assert.equal(existsSync(ref), true);
    assert.equal((await readFile(ref, "utf8")).includes("refresh-secret"), false);
    assert.deepEqual(await service.load(connector.id), secret);
    await service.delete(connector.id);
    assert.equal(existsSync(ref), false);
    assert.equal((await readFile(join(dir, "logs", "kazvault.log"), "utf8")).includes("refresh-secret"), false);
  });
});

test("LocalFilesConnector importa arquivo valido e recusa inexistente", async () => {
  await withRepo(async ({ dir, repository }) => {
    const filePath = join(dir, "doc.txt");
    await writeFile(filePath, "hello");
    const ingest = fakeIngest();
    const connector = new LocalFilesConnector(repository, ingest);
    const result = await connector.import({ paths: [filePath], connectorName: "Teste local" });

    assert.equal(result.imported, 1);
    assert.equal(ingest.calls.length, 1);
    assert.equal(repository.listItems(result.connectorId).length, 1);

    const failed = await connector.import({ paths: [join(dir, "missing.txt")] });
    assert.equal(failed.failed, 1);
  });
});

test("AndroidFilesConnector monta chunks, valida hash e envia ao ingest", async () => {
  await withRepo(async ({ repository, storage }) => {
    const ingest = fakeIngest();
    const connector = new AndroidFilesConnector(repository, storage, ingest);
    const body = Buffer.from("abcdef");
    const first = body.subarray(0, 3);
    const second = body.subarray(3);
    const start = await connector.start({ deviceId: "device_1", fileName: "foto.jpg", mimeType: "image/jpeg", size: body.length });

    await connector.receiveChunk(start.uploadId, 0, first, sha256(first));
    await connector.receiveChunk(start.uploadId, 1, second, sha256(second));
    const completed = await connector.complete(start.uploadId, { totalChunks: 2, originalHash: sha256(body) });

    assert.equal(completed.result.originalHash, sha256(body));
    assert.equal(ingest.calls.length, 1);
    assert.equal(repository.listItems(completed.connectorId).length, 1);
  });
});

test("MobileContactsConnector mascara telefone e email em metadata", async () => {
  await withRepo(async ({ repository }) => {
    const connector = new MobileContactsConnector(repository, fakeIngest());
    const result = await connector.importJson({
      deviceId: "device_1",
      contacts: [{ id: "1", displayName: "Elton", phones: ["11999999999"], emails: ["elton@example.com"] }]
    });
    const [item] = repository.listItems(result.connectorId);
    const json = JSON.stringify(item.metadata);

    assert.equal(json.includes("11999999999"), false);
    assert.equal(json.includes("elton@example.com"), false);
    assert.equal(item.sourceType, "contact");
  });
});

test("MobileCalendarConnector nao salva descricao sensivel em metadata", async () => {
  await withRepo(async ({ repository }) => {
    const connector = new MobileCalendarConnector(repository, fakeIngest());
    const result = await connector.importJson({
      deviceId: "device_1",
      events: [{ id: "1", title: "Reuniao", start: "2026-05-12", end: "2026-05-12", description: "segredo" }]
    });
    const [item] = repository.listItems(result.connectorId);

    assert.equal(JSON.stringify(item.metadata).includes("segredo"), false);
    assert.equal(item.sourceType, "calendar-event");
  });
});

test("GmailOAuthService gera authUrl e falha seguro sem env", () => {
  const old = snapshotEnv(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]);
  process.env.GOOGLE_CLIENT_ID = "client";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost/callback";
  const oauth = new GmailOAuthService();
  assert.match(oauth.start().authUrl, /accounts\.google\.com/);
  restoreEnv(old);
  assert.throws(() => new GmailOAuthService().start(), /OAuth do Gmail nao configurado/);
});

test("IMAP criptografa appPassword e resposta publica nao expoe credenciais", async () => {
  await withRepo(async ({ repository, storage, log }) => {
    const credentials = new ConnectorCredentialsService(
      repository,
      new TokenVaultService(storage, new ConnectorKeyManager(storage, log))
    );
    const imap = new ImapConnector(repository, credentials);
    const connector = await imap.connect({
      host: "imap.example.com",
      port: 993,
      secure: true,
      email: "user@example.com",
      appPassword: "app-secret"
    });
    const ref = repository.findCredentialPath(connector.id);

    assert.equal((await readFile(ref, "utf8")).includes("app-secret"), false);
    assert.equal("encryptedCredentialsRef" in publicConnector(repository.findConnector(connector.id)), false);
    await imap.disconnect(connector.id);
    assert.equal(repository.findConnector(connector.id).status, "disconnected");
  });
});

async function withRepo(callback) {
  const dir = await mkdtemp(join(tmpdir(), "kazvault-connectors-"));
  const db = new VaultDatabase(join(dir, ".kazvault", "kazvault.sqlite"));
  await db.init();
  const repository = new ConnectorsRepository(db);
  const storage = {
    storageDir: dir,
    metaDir: join(dir, ".kazvault"),
    logPath: join(dir, "logs", "kazvault.log")
  };
  const log = {
    warn: async (_event, data = {}) => {
      await mkdir(join(dir, "logs"), { recursive: true });
      await writeFile(storage.logPath, JSON.stringify(data), { flag: "a" });
    }
  };

  try {
    await callback({ dir, repository, storage, log });
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

function snapshotEnv(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
