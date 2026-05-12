import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export class LogService {
  constructor(private readonly logFilePath: string) {}

  async info(event: string, data: Record<string, unknown> = {}): Promise<void> {
    await this.write("info", event, data);
  }

  async warn(event: string, data: Record<string, unknown> = {}): Promise<void> {
    await this.write("warn", event, data);
  }

  async error(event: string, data: Record<string, unknown> = {}): Promise<void> {
    await this.write("error", event, data);
  }

  private async write(level: "info" | "warn" | "error", event: string, data: Record<string, unknown>): Promise<void> {
    await mkdir(dirname(this.logFilePath), { recursive: true });

    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      data: sanitize(data)
    });

    await appendFile(this.logFilePath, `${line}\n`, "utf8");
  }
}

function sanitize(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const lowered = key.toLowerCase();

      if (lowered.includes("token") || lowered.includes("password") || lowered.includes("secret")) {
        return [key, "[omitted]"];
      }

      return [key, item];
    })
  );
}
