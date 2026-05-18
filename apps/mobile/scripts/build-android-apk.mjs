import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileRoot = dirname(scriptDir);
const androidDir = join(mobileRoot, "android");
const gradleCommand = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const sourceApk = join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const outputApk = join(mobileRoot, "dist", "kazvault-debug.apk");
const javaHome = process.env.JAVA_HOME || process.env.KAZVAULT_JAVA_HOME || findBundledJdk();
const buildEnv = javaHome
  ? { ...process.env, JAVA_HOME: javaHome, PATH: `${join(javaHome, "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` }
  : process.env;

run("corepack", ["pnpm", "build"], mobileRoot);
run("node", [join("scripts", "ensure-android.mjs")], mobileRoot);
run("cap", ["sync", "android"], mobileRoot);
run(gradleCommand, ["assembleDebug"], androidDir);

if (!existsSync(sourceApk)) {
  console.error(`APK nao encontrado em ${sourceApk}`);
  process.exit(1);
}

mkdirSync(dirname(outputApk), { recursive: true });
copyFileSync(sourceApk, outputApk);
console.log(`APK gerado em ${outputApk}`);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: buildEnv,
    stdio: "inherit",
    shell: true
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findBundledJdk() {
  const home = process.env.USERPROFILE || process.env.HOME;

  if (!home) {
    return undefined;
  }

  const candidates = [
    join(home, ".cache", "kazvault", "jdk-17"),
    join(home, ".cache", "kazvault", "jdk-21")
  ];

  return candidates.find((candidate) => existsSync(join(candidate, "bin", process.platform === "win32" ? "java.exe" : "java")));
}
