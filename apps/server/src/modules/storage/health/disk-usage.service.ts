import { constants } from "node:fs";
import { access, mkdir, statfs, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type DiskUsage = {
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  warning?: string;
};

export class DiskUsageService {
  async getDiskUsage(rootPath: string): Promise<DiskUsage> {
    try {
      const stats = await statfs(rootPath);
      const totalBytes = Number(stats.bsize) * Number(stats.blocks);
      const availableBytes = Number(stats.bsize) * Number(stats.bavail);

      return {
        totalBytes,
        availableBytes,
        usedBytes: Math.max(0, totalBytes - availableBytes)
      };
    } catch {
      return {
        totalBytes: 0,
        availableBytes: 0,
        usedBytes: 0,
        warning: "Nao foi possivel detectar espaco real do disco. Operacao limitada pela quota configurada."
      };
    }
  }

  async getAvailableBytes(rootPath: string): Promise<number> {
    return (await this.getDiskUsage(rootPath)).availableBytes;
  }

  async getTotalBytes(rootPath: string): Promise<number> {
    return (await this.getDiskUsage(rootPath)).totalBytes;
  }

  async isWritable(rootPath: string): Promise<boolean> {
    try {
      await mkdir(rootPath, { recursive: true });
      await access(rootPath, constants.W_OK);
      const probePath = join(rootPath, `.mantisvault-write-test-${randomUUID()}.tmp`);
      await writeFile(probePath, "ok");
      await rm(probePath, { force: true });
      return true;
    } catch {
      return false;
    }
  }
}
