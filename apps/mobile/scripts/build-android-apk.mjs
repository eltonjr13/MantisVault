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
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || findAndroidSdk();
const buildEnv = javaHome
  ? {
      ...process.env,
      JAVA_HOME: javaHome,
      ANDROID_HOME: androidHome ?? process.env.ANDROID_HOME,
      ANDROID_SDK_ROOT: androidHome ?? process.env.ANDROID_SDK_ROOT,
      PATH: [
        join(javaHome, "bin"),
        androidHome ? join(androidHome, "cmdline-tools", "latest", "bin") : undefined,
        androidHome ? join(androidHome, "platform-tools") : undefined,
        process.env.PATH
      ].filter(Boolean).join(process.platform === "win32" ? ";" : ":")
    }
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
    join(home, ".cache", "kazvault", "jdk-21"),
    join(home, ".cache", "kazvault", "temurin-jdk-17-admin", "PFiles64", "Eclipse Adoptium", "jdk-17.0.19.10-hotspot")
  ];

  return candidates.find((candidate) => existsSync(join(candidate, "bin", process.platform === "win32" ? "java.exe" : "java")));
}

function findAndroidSdk() {
  const home = process.env.USERPROFILE || process.env.HOME;
  const localAppData = process.env.LOCALAPPDATA;

  const candidates = [
    localAppData ? join(localAppData, "Android", "Sdk") : undefined,
    home ? join(home, "AppData", "Local", "Android", "Sdk") : undefined,
    "C:\\Android\\Sdk"
  ].filter(Boolean);

  return candidates.find((candidate) =>
    existsSync(join(candidate, "platforms", "android-34", "android.jar"))
  );
}
