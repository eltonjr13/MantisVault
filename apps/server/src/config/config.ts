export interface ServerConfig {
  host: string;
  port: number;
  storageDir: string;
  spaceLimitBytes: number;
  pairTokenTtlSeconds: number;
}

const ONE_TB_BYTES = 1_099_511_627_776;

export function loadConfig(): ServerConfig {
  return {
    host: process.env.KAZVAULT_HOST ?? "0.0.0.0",
    port: readNumber("KAZVAULT_PORT", 4577),
    storageDir: process.env.KAZVAULT_STORAGE_DIR ?? "E:/cloudkz",
    spaceLimitBytes: readNumber("KAZVAULT_SPACE_LIMIT_BYTES", ONE_TB_BYTES),
    pairTokenTtlSeconds: readNumber("KAZVAULT_PAIR_TOKEN_TTL_SECONDS", 2 * 60)
  };
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
