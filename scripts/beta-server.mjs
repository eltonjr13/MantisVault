import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);
const env = { ...process.env, KAZVAULT_BETA: "1" };
const loadedEnvFiles = [
  loadEnvFile(join(repoRoot, ".env"), env),
  loadEnvFile(join(repoRoot, "apps", "server", ".env"), env)
].filter(Boolean);

const port = env.KAZVAULT_PORT || "4577";
const storageDir = env.KAZVAULT_STORAGE_DIR || "E:/cloudkz";
const appDataDir = env.KAZVAULT_APP_DATA_DIR || join(homedir(), ".kazvault");
const apkPath = env.KAZVAULT_ANDROID_APK || join(repoRoot, "apps", "mobile", "dist", "kazvault-debug.apk");

console.log("[KazVault beta] Iniciando servidor local");
console.log(`[KazVault beta] Env: ${loadedEnvFiles.length ? loadedEnvFiles.join(", ") : "padrao interno"}`);
console.log(`[KazVault beta] Pareamento no PC: http://localhost:${port}/pair`);
console.log(`[KazVault beta] APK: http://localhost:${port}/app/kazvault.apk`);
console.log(`[KazVault beta] APK local: ${apkPath}${existsSync(apkPath) ? "" : " (ainda nao gerado)"}`);
console.log(`[KazVault beta] Arquivos criptografados: ${join(storageDir, "files")}`);
console.log(`[KazVault beta] Logs: ${join(storageDir, "logs", "kazvault.log")}`);
console.log(`[KazVault beta] Metadados locais: ${appDataDir}`);

const child = spawn("corepack", ["pnpm", "--filter", "@kazvault/server", "start"], {
  cwd: repoRoot,
  env,
  stdio: "inherit",
  shell: true
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

function loadEnvFile(path, targetEnv) {
  if (!existsSync(path)) {
    return undefined;
  }

  const text = readFileSync(path, "utf8");

  for (const line of text.split(/\r?\n/g)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquote(trimmed.slice(separatorIndex + 1).trim());

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    targetEnv[key] = value;
  }

  return path;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
