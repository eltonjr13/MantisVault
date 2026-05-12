import { networkInterfaces, hostname } from "node:os";

export function getLocalIpAddress(): string {
  const interfaces = networkInterfaces();

  for (const values of Object.values(interfaces)) {
    for (const item of values ?? []) {
      if (item.family === "IPv4" && !item.internal) {
        return item.address;
      }
    }
  }

  return "127.0.0.1";
}

export function getServerName(): string {
  return hostname() || "KazVault PC";
}
