import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export class StorageService {
  readonly metaDir: string;
  readonly filesDir: string;
  readonly logsDir: string;
  readonly dbPath: string;
  readonly logPath: string;

  constructor(readonly storageDir: string) {
    this.metaDir = join(storageDir, ".kazvault");
    this.filesDir = join(storageDir, "files");
    this.logsDir = join(storageDir, "logs");
    this.dbPath = join(this.metaDir, "kazvault.sqlite");
    this.logPath = join(this.logsDir, "kazvault.log");
  }

  async init(): Promise<void> {
    await mkdir(this.metaDir, { recursive: true });
    await mkdir(this.filesDir, { recursive: true });
    await mkdir(this.logsDir, { recursive: true });
  }

  getFileDir(fileId: string): string {
    return join(this.filesDir, fileId);
  }

  getChunksDir(fileId: string): string {
    return join(this.getFileDir(fileId), "chunks");
  }

  getManifestPath(fileId: string): string {
    return join(this.getFileDir(fileId), "manifest.enc");
  }

  getChunkPath(fileId: string, index: number): string {
    return join(this.getChunksDir(fileId), `${index}.chunk.enc`);
  }

  getKeyringPath(): string {
    return join(this.metaDir, "vault-keyring.json");
  }

  async prepareFile(fileId: string): Promise<void> {
    await mkdir(this.getChunksDir(fileId), { recursive: true });
  }

  async writeEncryptedManifest(fileId: string, bytes: Uint8Array): Promise<void> {
    await this.prepareFile(fileId);
    await writeFile(this.getManifestPath(fileId), bytes);
  }

  async writeEncryptedChunk(fileId: string, index: number, bytes: Uint8Array): Promise<void> {
    await this.prepareFile(fileId);
    await writeFile(this.getChunkPath(fileId, index), bytes);
  }

  async chunkExists(fileId: string, index: number): Promise<boolean> {
    return existsSync(this.getChunkPath(fileId, index));
  }

  async deleteFile(fileId: string): Promise<void> {
    await rm(this.getFileDir(fileId), { recursive: true, force: true });
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
