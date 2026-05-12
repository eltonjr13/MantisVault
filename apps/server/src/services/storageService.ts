import { copyFile, mkdir, readdir, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export class StorageService {
  readonly metaDir: string;
  readonly logsDir: string;
  readonly dbPath: string;
  readonly logPath: string;
  filesDir: string;

  constructor(public storageDir: string, metaDir?: string) {
    this.metaDir = metaDir ?? join(storageDir, ".kazvault");
    this.filesDir = join(storageDir, "files");
    this.logsDir = join(storageDir, "logs");
    this.dbPath = join(this.metaDir, "kazvault.sqlite");
    this.logPath = join(this.logsDir, "kazvault.log");
  }

  async init(): Promise<void> {
    await this.migrateLegacyMeta();
    await mkdir(this.metaDir, { recursive: true });
    await mkdir(this.filesDir, { recursive: true });
    await mkdir(this.logsDir, { recursive: true });
  }

  async updateStorageDir(storageDir: string): Promise<void> {
    this.storageDir = storageDir;
    this.filesDir = join(storageDir, "files");
    await mkdir(this.filesDir, { recursive: true });
  }

  getFileDir(fileId: string, storageDir = this.storageDir): string {
    return join(storageDir, "files", fileId);
  }

  getChunksDir(fileId: string, storageDir = this.storageDir): string {
    return join(this.getFileDir(fileId, storageDir), "chunks");
  }

  getManifestPath(fileId: string, storageDir = this.storageDir): string {
    return join(this.getFileDir(fileId, storageDir), "manifest.enc");
  }

  getChunkPath(fileId: string, index: number, storageDir = this.storageDir): string {
    return join(this.getChunksDir(fileId, storageDir), `${index}.chunk.enc`);
  }

  getKeyringPath(): string {
    return join(this.metaDir, "vault-keyring.json");
  }

  async prepareFile(fileId: string, storageDir = this.storageDir): Promise<void> {
    await mkdir(this.getChunksDir(fileId, storageDir), { recursive: true });
  }

  async writeEncryptedManifest(fileId: string, bytes: Uint8Array, storageDir = this.storageDir): Promise<void> {
    await this.prepareFile(fileId, storageDir);
    await writeFile(this.getManifestPath(fileId, storageDir), bytes);
  }

  async readEncryptedManifest(fileId: string, storageDir = this.storageDir): Promise<Buffer | undefined> {
    if (!existsSync(this.getManifestPath(fileId, storageDir))) {
      return undefined;
    }

    return readFile(this.getManifestPath(fileId, storageDir));
  }

  async writeEncryptedChunk(fileId: string, index: number, bytes: Uint8Array, storageDir = this.storageDir): Promise<void> {
    await this.prepareFile(fileId, storageDir);
    await writeFile(this.getChunkPath(fileId, index, storageDir), bytes);
  }

  async readEncryptedChunk(fileId: string, index: number, storageDir = this.storageDir): Promise<Buffer | undefined> {
    if (!existsSync(this.getChunkPath(fileId, index, storageDir))) {
      return undefined;
    }

    return readFile(this.getChunkPath(fileId, index, storageDir));
  }

  async chunkExists(fileId: string, index: number, storageDir = this.storageDir): Promise<boolean> {
    return existsSync(this.getChunkPath(fileId, index, storageDir));
  }

  async deleteFile(fileId: string, storageDir = this.storageDir): Promise<void> {
    await rm(this.getFileDir(fileId, storageDir), { recursive: true, force: true });
  }

  async readKeyring(): Promise<unknown | undefined> {
    if (!existsSync(this.getKeyringPath())) {
      return undefined;
    }

    return JSON.parse(await readFile(this.getKeyringPath(), "utf8")) as unknown;
  }

  async writeKeyring(value: unknown): Promise<void> {
    await writeFile(this.getKeyringPath(), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  async getUsedBytes(): Promise<number> {
    return getDirectorySize(this.filesDir);
  }

  async getDiskStats(): Promise<{ totalBytes: number; freeBytes: number; usedBytes: number } | undefined> {
    try {
      const stats = await statfs(this.storageDir);
      const totalBytes = Number(stats.bsize) * Number(stats.blocks);
      const freeBytes = Number(stats.bsize) * Number(stats.bavail);

      return {
        totalBytes,
        freeBytes,
        usedBytes: Math.max(0, totalBytes - freeBytes)
      };
    } catch {
      return undefined;
    }
  }

  private async migrateLegacyMeta(): Promise<void> {
    const legacyMetaDir = join(this.storageDir, ".kazvault");

    if (legacyMetaDir === this.metaDir) {
      return;
    }

    await mkdir(this.metaDir, { recursive: true });
    await copyIfMissing(join(legacyMetaDir, "kazvault.sqlite"), this.dbPath);
    await copyIfMissing(join(legacyMetaDir, "vault-keyring.json"), this.getKeyringPath());
  }
}

async function copyIfMissing(from: string, to: string): Promise<void> {
  if (!existsSync(from) || existsSync(to)) {
    return;
  }

  await copyFile(from, to);
}

async function getDirectorySize(path: string): Promise<number> {
  if (!existsSync(path)) {
    return 0;
  }

  const pathStat = await stat(path);

  if (pathStat.isFile()) {
    return pathStat.size;
  }

  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map((entry) => getDirectorySize(join(path, entry.name)))
  );

  return sizes.reduce((total, size) => total + size, 0);
}
