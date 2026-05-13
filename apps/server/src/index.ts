import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { loadConfig } from "./config/config";
import { VaultDatabase } from "./db/database";
import { FilesRepository } from "./repositories/filesRepository";
import { UploadsRepository } from "./repositories/uploadsRepository";
import { ChunksRepository } from "./repositories/chunksRepository";
import { registerPairRoutes } from "./routes/pairRoutes";
import { registerUploadRoutes } from "./routes/uploadRoutes";
import { registerVaultRoutes } from "./routes/vaultRoutes";
import { registerAuthSessionRoutes } from "./routes/authSessionRoutes";
import { registerConnectorsRoutes } from "./modules/connectors/connectors.routes";
import { ConnectorsRepository } from "./modules/connectors/connectors.repository";
import { buildStorageManagerModule } from "./modules/storage/storage.service";
import { registerStorageRoutes } from "./modules/storage/storage.routes";
import { LogService } from "./services/logService";
import { AuthSessionService } from "./services/authSessionService";
import { PairingService } from "./services/pairingService";
import { StorageService } from "./services/storageService";

async function main(): Promise<void> {
  const config = loadConfig();
  const storage = new StorageService(config.storageDir, config.appDataDir);
  await storage.init();

  const log = new LogService(storage.logPath);
  const db = new VaultDatabase(storage.dbPath);
  await db.init();

  const filesRepository = new FilesRepository(db);
  const uploadsRepository = new UploadsRepository(db);
  const chunksRepository = new ChunksRepository(db);
  const connectorsRepository = new ConnectorsRepository(db);
  const storageManager = buildStorageManagerModule(db);
  const authSessionService = new AuthSessionService(db, `${storage.metaDir}/auth-secret`);
  await storageManager.pools.ensureDefaultPool({
    name: "MantisVault Vault",
    rootPath: storage.storageDir,
    quotaBytes: config.spaceLimitBytes,
    reservedFreeBytes: 20 * 1024 * 1024 * 1024
  });
  filesRepository.backfillStorageDir(storage.storageDir);
  const pairingService = new PairingService(config, storage);

  const app = Fastify({
    logger: true,
    bodyLimit: 32 * 1024 * 1024
  });

  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  await app.register(multipart, {
    limits: {
      fileSize: 64 * 1024 * 1024
    }
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "authorization",
      "content-type",
      "x-kazvault-token",
      "x-chunk-sha256",
      "x-kazvault-plain-chunk-sha256"
    ]
  });

  app.get("/health", async () => ({
    status: "ok",
    app: "KazVault"
  }));

  await registerPairRoutes(app, pairingService, log, authSessionService);
  await registerAuthSessionRoutes(app, {
    authSessionService,
    pairingService,
    log
  });
  await registerUploadRoutes(app, {
    config,
    filesRepository,
    uploadsRepository,
    chunksRepository,
    storageManager,
    storage,
    pairingService,
    authSessionService,
    log
  });
  await registerVaultRoutes(app, {
    config,
    filesRepository,
    uploadsRepository,
    chunksRepository,
    storageManager,
    storage,
    pairingService,
    authSessionService,
    log
  });
  await registerStorageRoutes(app, {
    storageManager,
    pairingService,
    authSessionService
  });
  await registerConnectorsRoutes(app, {
    dbRepository: connectorsRepository,
    filesRepository,
    chunksRepository,
    storageManager,
    storage,
    pairingService,
    authSessionService,
    log
  });

  await app.listen({
    host: config.host,
    port: config.port
  });

  await log.info("server_started", {
    host: config.host,
    port: config.port,
    storageDir: config.storageDir,
    spaceLimitBytes: config.spaceLimitBytes
  });

  const pairPayload = pairingService.getPayload();
  app.log.info(`KazVault pareamento: ${pairPayload.baseUrl}/pair`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
