import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  storageDir: string;
  appDataDir: string;
  settingsPath: string;
  spaceLimitBytes: number;
  pairTokenTtlSeconds: number;
}

const ONE_TB_BYTES = 1_099_511_627_776;

export function loadConfig(): ServerConfig {
  const appDataDir = process.env.KAZVAULT_APP_DATA_DIR ?? join(homedir(), ".kazvault");
  const settingsPath = process.env.KAZVAULT_SETTINGS_PATH ?? join(appDataDir, "settings.json");
  const settings = readSettings(settingsPath);
  const storageDir = process.env.KAZVAULT_STORAGE_DIR ?? settings.storageDir ?? "E:/cloudkz";

  return {
    host: process.env.KAZVAULT_HOST ?? "0.0.0.0",
    port: readNumber("KAZVAULT_PORT", 4577),
    storageDir,
    appDataDir,
    settingsPath,
    spaceLimitBytes: readNumber("KAZVAULT_SPACE_LIMIT_BYTES", ONE_TB_BYTES),
    pairTokenTtlSeconds: readNumber("KAZVAULT_PAIR_TOKEN_TTL_SECONDS", 2 * 60)
  };
}

export function saveStorageDirSetting(settingsPath: string, storageDir: string): void {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify({ storageDir }, null, 2)}\n`, "utf8");
}

function readSettings(settingsPath: string): { storageDir?: string } {
  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as { storageDir?: unknown };
    return typeof parsed.storageDir === "string" ? { storageDir: parsed.storageDir } : {};
  } catch {
    return {};
  }
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
