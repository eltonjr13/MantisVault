import type { OptimizationResult } from "@kazvault/shared";

export interface VaultManifest extends OptimizationResult {
  chunks: Array<{
    index: number;
    hash: string;
    sizeBytes: number;
    deduplicated: boolean;
  }>;
}

export function createManifest(result: OptimizationResult, chunks: VaultManifest["chunks"]): VaultManifest {
  return {
    ...result,
    chunks
  };
}
