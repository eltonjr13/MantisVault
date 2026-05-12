import { argon2id, createSHA256, sha256 } from "hash-wasm";
import sodium from "libsodium-wrappers-sumo";

const MAGIC = new Uint8Array([0x4b, 0x5a, 0x56, 0x31]);
const NONCE_LENGTH = 24;
const KEY_LENGTH = 32;

export interface Argon2idOptions {
  iterations?: number;
  memoryKiB?: number;
  parallelism?: number;
}

export interface DerivedKeyMetadata {
  algorithm: "argon2id";
  iterations: number;
  memoryKiB: number;
  parallelism: number;
  keyLength: number;
}

export const defaultKdfMetadata: DerivedKeyMetadata = {
  algorithm: "argon2id",
  iterations: 3,
  memoryKiB: 64 * 1024,
  parallelism: 1,
  keyLength: KEY_LENGTH
};

export async function ensureCryptoReady(): Promise<void> {
  await sodium.ready;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  options: Argon2idOptions = {}
): Promise<Uint8Array> {
  const metadata = {
    ...defaultKdfMetadata,
    ...options
  };

  const key = await argon2id({
    password,
    salt: bytesToHex(salt),
    parallelism: metadata.parallelism,
    iterations: metadata.iterations,
    memorySize: metadata.memoryKiB,
    hashLength: KEY_LENGTH,
    outputType: "binary"
  });

  return new Uint8Array(key);
}

export async function encryptBytes(plaintext: Uint8Array, key: Uint8Array, aad = ""): Promise<Uint8Array> {
  assertKey(key);
  await ensureCryptoReady();

  const nonce = sodium.randombytes_buf(NONCE_LENGTH) as Uint8Array;
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    aad ? new TextEncoder().encode(aad) : null,
    null,
    nonce,
    key
  ) as Uint8Array;

  return concatBytes(MAGIC, nonce, ciphertext);
}

export async function decryptBytes(envelope: Uint8Array, key: Uint8Array, aad = ""): Promise<Uint8Array> {
  assertKey(key);
  await ensureCryptoReady();

  if (envelope.byteLength < MAGIC.byteLength + NONCE_LENGTH || !hasMagic(envelope)) {
    throw new Error("Envelope criptografico invalido.");
  }

  const nonce = envelope.slice(MAGIC.byteLength, MAGIC.byteLength + NONCE_LENGTH);
  const ciphertext = envelope.slice(MAGIC.byteLength + NONCE_LENGTH);

  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    aad ? new TextEncoder().encode(aad) : null,
    nonce,
    key
  ) as Uint8Array;
}

export async function encryptJson(value: unknown, key: Uint8Array, aad = ""): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await encryptBytes(bytes, key, aad);
  return bytesToBase64(encrypted);
}

export async function decryptJson<T>(base64Envelope: string, key: Uint8Array, aad = ""): Promise<T> {
  const envelope = base64ToBytes(base64Envelope);
  const bytes = await decryptBytes(envelope, key, aad);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Tentar usar Web Crypto API primeiro (mais rápido)
  if (globalThis.crypto && globalThis.crypto.subtle) {
    try {
      const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
      return bytesToHex(new Uint8Array(digest));
    } catch (error) {
      console.warn("Web Crypto API falhou, usando hash-wasm como fallback:", error);
    }
  }
  
  // Fallback para hash-wasm (funciona em qualquer contexto)
  return await sha256(bytes);
}

export async function hashChunksSha256(chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();

  for await (const chunk of chunks) {
    hasher.update(chunk);
  }

  return hasher.digest("hex");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.byteLength; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index);
  }

  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64ToBytes(padded);
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }

  return out;
}

function hasMagic(bytes: Uint8Array): boolean {
  return MAGIC.every((byte, index) => bytes[index] === byte);
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength !== KEY_LENGTH) {
    throw new Error("Chave invalida para XChaCha20-Poly1305.");
  }
}
