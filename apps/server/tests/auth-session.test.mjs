import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Fastify = require("fastify");
const { AuthSessionService } = require("../dist/services/authSessionService.js");
const { VaultDatabase } = require("../dist/db/database.js");
const { buildStorageManagerModule } = require("../dist/modules/storage/storage.service.js");
const { registerStorageRoutes } = require("../dist/modules/storage/storage.routes.js");

test("sessao anonima persiste via refresh token e autentica rotas protegidas", async () => {
  await withAuth(async ({ app, auth }) => {
    const session = auth.createAnonymousSession({ deviceName: "Android" });

    assert.equal(Boolean(session.accessToken), true);
    assert.equal(Boolean(session.refreshToken), true);
    assert.equal(auth.verifyAccessToken(session.accessToken)?.deviceId, session.deviceId);

    const refreshed = auth.refresh(session.refreshToken);
    assert.equal(Boolean(refreshed?.accessToken), true);
    assert.equal(auth.refresh(session.refreshToken), undefined);

    const unauthorized = await app.inject({ method: "GET", url: "/api/storage/pools" });
    assert.equal(unauthorized.statusCode, 401);

    const authorized = await app.inject({
      method: "GET",
      url: "/api/storage/pools",
      headers: { "x-kazvault-token": refreshed.accessToken }
    });
    assert.equal(authorized.statusCode, 200);
  });
});

async function withAuth(callback) {
  const dir = await mkdtemp(join(tmpdir(), "kazvault-auth-"));
  const db = new VaultDatabase(join(dir, ".kazvault", "kazvault.sqlite"));
  await db.init();
  const storage = buildStorageManagerModule(db);
  const auth = new AuthSessionService(db, join(dir, ".kazvault", "auth-secret"));
  const app = Fastify();

  await registerStorageRoutes(app, {
    storageManager: storage,
    pairingService: { verify: () => false },
    authSessionService: auth
  });

  try {
    await callback({ app, auth });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
}
