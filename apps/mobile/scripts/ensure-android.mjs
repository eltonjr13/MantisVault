import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync("android")) {
  const result = spawnSync("cap", ["add", "android"], {
    stdio: "inherit",
    shell: true
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
