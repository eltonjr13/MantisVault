import { readdir } from "node:fs/promises";
import { join, parse } from "node:path";
import type { StorageLocationRepository } from "./storage-location.repository";
import type { StorageLocation } from "../storage.types";

export class StorageLocationService {
  constructor(private readonly locations: StorageLocationRepository) {}

  list(poolId: string): StorageLocation[] {
    return this.locations.listAllByPool(poolId);
  }

  async detectCandidates(): Promise<Array<{ label: string; rootPath: string; isSystemDrive: boolean }>> {
    if (process.platform !== "win32") {
      return [];
    }

    const candidates: Array<{ label: string; rootPath: string; isSystemDrive: boolean }> = [];
    const systemRoot = parse(process.env.SystemRoot ?? process.env.SystemDrive ?? "C:\\").root.toLowerCase();

    for (let code = 67; code <= 90; code += 1) {
      const letter = String.fromCharCode(code);
      const root = `${letter}:\\`;

      try {
        await readdir(root);
        candidates.push({
          label: `Disco ${letter}`,
          rootPath: join(root, "MantisVaultPool"),
          isSystemDrive: root.toLowerCase() === systemRoot
        });
      } catch {
        continue;
      }
    }

    return candidates;
  }
}
