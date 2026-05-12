import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StorageService } from "../../../services/storageService";
import type { LogService } from "../../../services/logService";

type StoredKey = {
  version: 1;
  keyBase64: string;
  createdAt: string;
};

export class ConnectorKeyManager {
  constructor(
    private readonly storage: StorageService,
    private readonly log: LogService
  ) {}

  async getKey(): Promise<Buffer> {
    const fromEnv = process.env.KAZVAULT_CONNECTOR_KEY;

    if (fromEnv) {
      const key = Buffer.from(fromEnv, "base64");

      if (key.byteLength !== 32) {
        throw new Error("KAZVAULT_CONNECTOR_KEY deve ser base64 de 32 bytes.");
      }

      return key;
    }

    const keyPath = this.getKeyPath();

    if (existsSync(keyPath)) {
      const stored = JSON.parse(await readFile(keyPath, "utf8")) as StoredKey;
      return Buffer.from(stored.keyBase64, "base64");
    }

    const key = randomBytes(32);
    await mkdir(dirname(keyPath), { recursive: true });
    await writeFile(
      keyPath,
      `${JSON.stringify({ version: 1, keyBase64: key.toString("base64"), createdAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8"
    );
    await this.log.warn("connector_key_generated", {
      path: keyPath,
      message: "Chave local criada para credenciais e ingest de conectores."
    });
    return key;
  }

  private getKeyPath(): string {
    return join(this.storage.metaDir, "connector-key.json");
  }
}

export class TokenVaultService {
  constructor(
    private readonly storage: StorageService,
    private readonly keyManager: ConnectorKeyManager
  ) {}

  getCredentialsDir(): string {
    return join(this.storage.storageDir, "connector-credentials");
  }

  async encryptJson(payload: unknown, aad: string): Promise<string> {
    const key = await this.keyManager.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad));
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = {
      version: 1,
      algorithm: "aes-256-gcm",
      ivBase64: iv.toString("base64"),
      tagBase64: tag.toString("base64"),
      ciphertextBase64: encrypted.toString("base64")
    };
    const path = join(this.getCredentialsDir(), `${randomUUID()}.json.enc`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(envelope)}\n`, "utf8");
    return path;
  }

  async decryptJson<T>(path: string, aad: string): Promise<T> {
    const key = await this.keyManager.getKey();
    const envelope = JSON.parse(await readFile(path, "utf8")) as {
      version: 1;
      ivBase64: string;
      tagBase64: string;
      ciphertextBase64: string;
    };
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.ivBase64, "base64"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(envelope.tagBase64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertextBase64, "base64")),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  }

  async delete(path: string | undefined): Promise<void> {
    if (path) {
      await rm(path, { force: true });
    }
  }
}
