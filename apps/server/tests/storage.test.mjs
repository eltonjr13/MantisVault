import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Fastify = require("fastify");
const { VaultDatabase } = require("../dist/db/database.js");
const { buildStorageManagerModule } = require("../dist/modules/storage/storage.service.js");
const { registerStorageRoutes } = require("../dist/modules/storage/storage.routes.js");
const { StorageError } = require("../dist/modules/storage/storage.errors.js");

const GB = 1024 * 1024 * 1024;

test("StoragePool single cria pool com location validada", async () => {
  await withStorage(async ({ dir, storage }) => {
    const created = await storage.pools.create({
      name: "Meu Cofre",
      mode: "single",
      quotaBytes: 2 * GB,
      reservedFreeBytes: 0,
      locations: [{
        label: "Disco Principal",
        rootPath: join(dir, "single"),
        quotaBytes: 2 * GB,
        reservedFreeBytes: 0
      }]
    });

    assert.equal(created.pool.mode, "single");
    assert.equal(created.locations.length, 1);
    assert.equal(existsSync(created.locations[0].rootPath), true);
  });
});

test("pooled-capacity distribui chunk para location com mais espaco disponivel", async () => {
  await withStorage(async ({ dir, storage }) => {
    const created = await storage.pools.create({
      name: "Pool",
      mode: "pooled-capacity",
      quotaBytes: 5 * GB,
      reservedFreeBytes: 0,
      locations: [
        { label: "A", rootPath: join(dir, "a"), quotaBytes: 2 * GB, reservedFreeBytes: 0 },
        { label: "B", rootPath: join(dir, "b"), quotaBytes: 4 * GB, reservedFreeBytes: 0 }
      ]
    });
    const result = await storage.chunks.storeChunk({
      poolId: created.pool.id,
      chunkHash: sha(randomBytes(16)),
      encryptedBuffer: Buffer.from("chunk")
    });

    assert.equal(result.locations.length, 1);
    assert.equal(result.locations[0].locationId, created.locations.find((location) => location.label === "B").id);
  });
});

test("mirrored exige duas locations e salva duas copias", async () => {
  await withStorage(async ({ dir, storage }) => {
    await assert.rejects(
      () => storage.pools.create({
        name: "Mirror invalido",
        mode: "mirrored",
        quotaBytes: 2 * GB,
        reservedFreeBytes: 0,
        locations: [{ label: "A", rootPath: join(dir, "one"), quotaBytes: 2 * GB, reservedFreeBytes: 0 }]
      }),
      /Modo Protecao exige/
    );

    const created = await storage.pools.create({
      name: "Mirror",
      mode: "mirrored",
      quotaBytes: 4 * GB,
      reservedFreeBytes: 0,
      locations: [
        { label: "A", rootPath: join(dir, "m1"), quotaBytes: 2 * GB, reservedFreeBytes: 0 },
        { label: "B", rootPath: join(dir, "m2"), quotaBytes: 2 * GB, reservedFreeBytes: 0 }
      ]
    });
    const result = await storage.chunks.storeChunk({
      poolId: created.pool.id,
      chunkHash: sha(randomBytes(16)),
      encryptedBuffer: Buffer.from("mirror")
    });

    assert.equal(result.locations.length, 2);
    assert.notEqual(result.locations[0].locationId, result.locations[1].locationId);
  });
});

test("quota bloqueia gravacao acima do limite e reserva", async () => {
  await withStorage(async ({ dir, storage }) => {
    const created = await storage.pools.create({
      name: "Quota",
      mode: "single",
      quotaBytes: 2 * GB,
      reservedFreeBytes: 0,
      criticalThresholdPercent: 100,
      locations: [{ label: "A", rootPath: join(dir, "quota"), quotaBytes: 2 * GB, reservedFreeBytes: 0 }]
    });
    storage.repositories.pools.update(created.pool.id, { usedBytes: 2 * GB - 2 }, new Date().toISOString());

    await assert.rejects(
      () => storage.chunks.storeChunk({
        poolId: created.pool.id,
        chunkHash: sha(randomBytes(16)),
        encryptedBuffer: Buffer.from("overflow")
      }),
      (error) => error instanceof StorageError && error.code === "STORAGE_QUOTA_EXCEEDED"
    );
  });
});

test("chunk path e registro sao seguros", async () => {
  await withStorage(async ({ dir, storage }) => {
    const created = await storage.pools.create({
      name: "Safe",
      mode: "single",
      quotaBytes: 2 * GB,
      reservedFreeBytes: 0,
      locations: [{ label: "A", rootPath: join(dir, "safe"), quotaBytes: 2 * GB, reservedFreeBytes: 0 }]
    });
    const hash = sha(Buffer.from("safe"));
    const result = await storage.chunks.storeChunk({
      poolId: created.pool.id,
      chunkHash: hash,
      encryptedBuffer: Buffer.from("safe")
    });
    const relativePath = result.locations[0].relativePath;

    assert.equal(relativePath, `chunks/${hash.slice(0, 2)}/${hash}.mvchunk`);
    assert.equal(relativePath.includes(".."), false);
    assert.equal(storage.repositories.chunkLocations.listByHash(hash).length, 1);
    assert.equal(storage.repositories.pools.find(created.pool.id).usedBytes, 4);
  });
});

test("health marca location offline e allocator nao seleciona offline", async () => {
  await withStorage(async ({ dir, storage }) => {
    const rootPath = join(dir, "offline");
    const created = await storage.pools.create({
      name: "Health",
      mode: "single",
      quotaBytes: 2 * GB,
      reservedFreeBytes: 0,
      locations: [{ label: "A", rootPath, quotaBytes: 2 * GB, reservedFreeBytes: 0 }]
    });
    await rm(rootPath, { recursive: true, force: true });
    const health = await storage.health.checkPool(created.pool.id);

    assert.equal(health.locations[0].status, "offline");
    await assert.rejects(
      () => storage.chunks.storeChunk({
        poolId: created.pool.id,
        chunkHash: sha(randomBytes(16)),
        encryptedBuffer: Buffer.from("offline")
      }),
      /offline/
    );
  });
});

test("remove location bloqueia chunks exclusivos", async () => {
  await withStorage(async ({ dir, storage }) => {
    const created = await storage.pools.create({
      name: "Remove",
      mode: "single",
      quotaBytes: 2 * GB,
      reservedFreeBytes: 0,
      locations: [{ label: "A", rootPath: join(dir, "remove"), quotaBytes: 2 * GB, reservedFreeBytes: 0 }]
    });
    await storage.chunks.storeChunk({
      poolId: created.pool.id,
      chunkHash: sha(randomBytes(16)),
      encryptedBuffer: Buffer.from("exclusive")
    });

    assert.throws(
      () => storage.pools.removeLocation(created.pool.id, created.locations[0].id),
      /chunks exclusivos/
    );
  });
});

test("hybrid espelha documentos e usa Smart Pool por tipo", async () => {
  await withStorage(async ({ dir, storage }) => {
    const created = await storage.pools.create({
      name: "Smart",
      mode: "hybrid",
      quotaBytes: 4 * GB,
      reservedFreeBytes: 0,
      locations: [
        { label: "A", rootPath: join(dir, "smart-a"), quotaBytes: 2 * GB, reservedFreeBytes: 0 },
        { label: "B", rootPath: join(dir, "smart-b"), quotaBytes: 2 * GB, reservedFreeBytes: 0 }
      ]
    });
    const result = await storage.chunks.storeChunk({
      poolId: created.pool.id,
      chunkHash: sha(Buffer.from("document")),
      encryptedBuffer: Buffer.from("document"),
      sourceFileName: "contrato.pdf",
      sourceMimeType: "application/pdf",
      plainSizeBytes: 8
    });

    assert.equal(result.storageMode, "hybrid");
    assert.equal(result.locations.length, 2);
  });
});

test("rebalance executa copia validada antes de remover origem", async () => {
  await withStorage(async ({ dir, storage }) => {
    const created = await storage.pools.create({
      name: "Rebalance",
      mode: "pooled-capacity",
      quotaBytes: 6 * GB,
      reservedFreeBytes: 0,
      locations: [
        { label: "A", rootPath: join(dir, "rebalance-a"), quotaBytes: 5 * GB, reservedFreeBytes: 0 },
        { label: "B", rootPath: join(dir, "rebalance-b"), quotaBytes: 2 * GB, reservedFreeBytes: 0 }
      ]
    });
    const hash = sha(Buffer.from("move-me"));
    await storage.chunks.storeChunk({
      poolId: created.pool.id,
      chunkHash: hash,
      encryptedBuffer: Buffer.from("move-me")
    });

    const plan = storage.rebalance.plan(created.pool.id);
    assert.equal(plan.executable, true);
    const executed = await storage.rebalance.queue(created.pool.id);
    assert.equal(executed.status, "completed");
    assert.equal(executed.executedMoves.length > 0, true);
    const records = storage.repositories.chunkLocations.listByHash(hash);
    assert.equal(records.length, 1);
    assert.equal(records[0].locationId, created.locations.find((location) => location.label === "B").id);
    assert.deepEqual(await storage.chunks.readChunk(hash), Buffer.from("move-me"));
  });
});

test("storage routes respondem JSON padronizado com autenticacao", async () => {
  await withStorage(async ({ dir, storage }) => {
    const app = Fastify();
    await registerStorageRoutes(app, {
      storageManager: storage,
      pairingService: { verify: (token) => token === "test-token" }
    });

    const unauthorized = await app.inject({ method: "GET", url: "/api/storage/pools" });
    assert.equal(unauthorized.statusCode, 401);

    const headers = { "x-kazvault-token": "test-token" };
    const created = await app.inject({
      method: "POST",
      url: "/api/storage/pools",
      headers,
      payload: {
        name: "HTTP Pool",
        mode: "single",
        quotaBytes: 2 * GB,
        reservedFreeBytes: 0,
        locations: [{ label: "HTTP", rootPath: join(dir, "http-pool"), quotaBytes: 2 * GB, reservedFreeBytes: 0 }]
      }
    });
    assert.equal(created.statusCode, 201);
    const createdBody = created.json();
    assert.equal(createdBody.pool.name, "HTTP Pool");

    const list = await app.inject({ method: "GET", url: "/api/storage/pools", headers });
    assert.equal(list.statusCode, 200);
    assert.equal(list.json().pools.length, 1);

    const usage = await app.inject({ method: "GET", url: `/api/storage/pools/${createdBody.pool.id}/usage`, headers });
    assert.equal(usage.statusCode, 200);
    assert.equal(usage.json().pool.id, createdBody.pool.id);

    const capabilities = await app.inject({ method: "GET", url: "/api/storage/capabilities", headers });
    assert.equal(capabilities.statusCode, 200);
    assert.equal(capabilities.json().capabilities.rebalance, true);

    await app.close();
  });
});

async function withStorage(callback) {
  const dir = await mkdtemp(join(tmpdir(), "kazvault-storage-"));
  const db = new VaultDatabase(join(dir, ".kazvault", "kazvault.sqlite"));
  await db.init();
  const storage = buildStorageManagerModule(db);

  try {
    await callback({ dir, storage });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
 