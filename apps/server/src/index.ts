import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config/config";
import { VaultDatabase } from "./db/database";
import { FilesRepository } from "./repositories/filesRepository";
import { UploadsRepository } from "./repositories/uploadsRepository";
import { registerPairRoutes } from "./routes/pairRoutes";
import { registerUploadRoutes } from "./routes/uploadRoutes";
import { registerVaultRoutes } from "./routes/vaultRoutes";
import { LogService } from "./services/logService";
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
  filesRepository.backfillStorageDir(storage.storageDir);
  const pairingService = new PairingService(config, storage);

  const app = Fastify({
    logger: true,
    bodyLimit: 32 * 1024 * 1024
  });

  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "x-kazvault-token", "x-chunk-sha256"]
  });

  app.get("/health", async () => ({
    status: "ok",
    app: "KazVault"
  }));

  await registerPairRoutes(app, pairingService, log);
  await registerUploadRoutes(app, {
    config,
    filesRepository,
    uploadsRepository,
    storage,
    pairingService,
    log
  });
  await registerVaultRoutes(app, {
    config,
    filesRepository,
    uploadsRepository,
    storage,
    pairingService,
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
