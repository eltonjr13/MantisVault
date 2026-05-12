import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { VaultDatabase } = require("../dist/db/database.js");
const { buildStorageManagerModule } = require("../dist/modules/storage/storage.service.js");
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
