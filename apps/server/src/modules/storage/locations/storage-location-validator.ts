import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { StorageError } from "../storage.errors";
import type { StorageLocation } from "../storage.types";
import { DEFAULT_RESERVED_FREE_BYTES, ONE_GB_BYTES } from "../quota/quota.types";

export type ValidatedStorageLocation = {
  normalizedPath: string;
  isSystemDrive: boolean;
  warnings: string[];
};

export class StorageLocationValidator {
  async validate(input: {
    rootPath: string;
    quotaBytes: number;
    reservedFreeBytes?: number;
    existingLocations?: StorageLocation[];
  }): Promise<ValidatedStorageLocation> {
    if (!input.rootPath || !isAbsolute(input.rootPath)) {
      throw new StorageError("STORAGE_INVALID_PATH", "Use um caminho absoluto para o storage pool.");
    }

    if (!Number.isFinite(input.quotaBytes) || input.quotaBytes <= ONE_GB_BYTES) {
      throw new StorageError("STORAGE_QUOTA_EXCEEDED", "A quota minima de uma location precisa ser maior que 1GB.");
    }

    const reserved = input.reservedFreeBytes ?? DEFAULT_RESERVED_FREE_BYTES;
    if (!Number.isFinite(reserved) || reserved < 0) {
      throw new StorageError("STORAGE_RESERVED_SPACE_VIOLATED", "Reserva de espaco livre invalida.");
    }

    const normalizedPath = resolve(input.rootPath);
    const parsed = parse(normalizedPath);
    if (!parsed.root || normalizedPath === parsed.root) {
      throw new StorageError("STORAGE_INVALID_PATH", "Escolha uma pasta dedicada, nao a raiz do disco.");
    }

    for (const existing of input.existingLocations ?? []) {
      if (samePath(existing.rootPath, normalizedPath)) {
        throw new StorageError("STORAGE_LOCATION_ALREADY_EXISTS");
      }
    }

    await mkdir(normalizedPath, { recursive: true });
    const tempPath = resolve(normalizedPath, `.mantisvault-validator-${randomUUID()}.tmp`);
    if (!isInside(normalizedPath, tempPath)) {
      throw new StorageError("STORAGE_INVALID_PATH");
    }

    try {
      await writeFile(tempPath, "ok", { flag: "wx" });
      await rm(tempPath, { force: true });
    } catch {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw new StorageError("STORAGE_LOCATION_NOT_WRITABLE");
    }

    const isSystemDrive = this.isSystemDrive(normalizedPath);
    const warnings: string[] = [];

    if (isSystemDrive) {
      warnings.push("Este disco parece ser o disco do sistema. Recomendamos reservar espaco livre.");
    }

    if (!existsSync(normalizedPath)) {
      warnings.push("A pasta foi criada automaticamente pelo MantisVault.");
    }

    return {
      normalizedPath,
      isSystemDrive,
      warnings
    };
  }

  normalizePath(rootPath: string): string {
    if (!rootPath || !isAbsolute(rootPath)) {
      throw new StorageError("STORAGE_INVALID_PATH");
    }

    return resolve(rootPath);
  }

  assertSafeRelativePath(relativePath: string): void {
    if (!relativePath || relativePath.includes("..") || isAbsolute(relativePath)) {
      throw new StorageError("STORAGE_INVALID_PATH");
    }
  }

  private isSystemDrive(path: string): boolean {
    const root = parse(path).root.toLowerCase();
    const systemDrive = `${(process.env.SystemDrive ?? process.env.HOMEDRIVE ?? parse(homedir()).root).replace(/[\\/]$/g, "")}${sep}`
      .toLowerCase();

    return root === systemDrive;
  }
}

function samePath(a: string, b: string): boolean {
  return resolve(a).toLowerCase() === resolve(b).toLowerCase();
}

function isInside(rootPath: string, candidatePath: string): boolean {
  const result = relative(rootPath, candidatePath);
  return result === "" || (!result.startsWith("..") && !isAbsolute(result));
}
