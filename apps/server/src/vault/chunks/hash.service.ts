import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function hashChunk(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
