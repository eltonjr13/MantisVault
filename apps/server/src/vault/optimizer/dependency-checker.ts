import { runCommand } from "./command-runner";

const BINARIES = ["zstd", "xz", "brotli", "cjxl", "djxl", "jpegtran", "oxipng", "qpdf", "ffmpeg"] as const;

export async function checkBinary(name: string): Promise<boolean> {
  const result = await runCommand(process.platform === "win32" ? "where" : "which", [name], { timeoutMs: 5_000 });
  return result.exitCode === 0;
}

export async function getAvailableOptimizers(): Promise<Record<string, boolean>> {
  const entries = await Promise.all(BINARIES.map(async (binary) => [binary, await checkBinary(binary)] as const));
  return Object.fromEntries(entries);
}
