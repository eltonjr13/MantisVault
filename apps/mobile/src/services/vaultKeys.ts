import {
  base64ToBytes,
  bytesToBase64,
  bytesToBase64Url,
  decryptBytes,
  deriveMasterKey,
  encryptBytes,
  randomBytes
} from "@kazvault/crypto";

const STORAGE_KEY = "kazvault:keyring:v1";
const DEVICE_UNLOCK_KEY = "kazvault:device-unlock-key:v1";
const MASTER_KEY_AAD = "kazvault:local-master-key";

export interface StoredKeyring {
  version: 1;
  kdf: "argon2id";
  saltBase64: string;
  recoverySaltBase64: string;
  wrappedMasterKeyBase64: string;
  wrappedMasterKeyWithRecoveryBase64: string;
  wrappedMasterKeyWithDeviceBase64?: string;
  createdAt: string;
}

export interface CreateKeyringResult {
  masterKey: Uint8Array;
  recoveryKey: string;
  createdAt: string;
}

export interface RecoveryKeyPackage {
  version: 1;
  kdf: "argon2id";
  recoverySaltBase64: string;
  wrappedMasterKeyWithRecoveryBase64: string;
  createdAt: string;
}

export function hasKeyring(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function hasDeviceUnlock(): boolean {
  return localStorage.getItem(DEVICE_UNLOCK_KEY) !== null;
}

export function getStoredKeyring(): StoredKeyring | undefined {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredKeyring) : undefined;
}

export async function createKeyring(password: string): Promise<CreateKeyringResult> {
  assertStrongEnough(password);

  const masterKey = randomBytes(32);
  const salt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const recoveryKey = bytesToBase64Url(randomBytes(32));
  const passwordKey = await deriveMasterKey(password, salt);
  const recoveryWrapKey = await deriveMasterKey(recoveryKey, recoverySalt);
  const wrappedMasterKey = await encryptBytes(masterKey, passwordKey, MASTER_KEY_AAD);
  const wrappedMasterKeyWithRecovery = await encryptBytes(masterKey, recoveryWrapKey, MASTER_KEY_AAD);
  const createdAt = new Date().toISOString();

  const stored: StoredKeyring = {
    version: 1,
    kdf: "argon2id",
    saltBase64: bytesToBase64(salt),
    recoverySaltBase64: bytesToBase64(recoverySalt),
    wrappedMasterKeyBase64: bytesToBase64(wrappedMasterKey),
    wrappedMasterKeyWithRecoveryBase64: bytesToBase64(wrappedMasterKeyWithRecovery),
    createdAt
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

  return {
    masterKey,
    recoveryKey,
    createdAt
  };
}

export async function createAutomaticKeyring(): Promise<CreateKeyringResult> {
  const masterKey = randomBytes(32);
  const deviceKey = randomBytes(32);
  const recoverySalt = randomBytes(16);
  const recoveryKey = bytesToBase64Url(randomBytes(32));
  const recoveryWrapKey = await deriveMasterKey(recoveryKey, recoverySalt);
  const wrappedMasterKeyWithDevice = await encryptBytes(masterKey, deviceKey, MASTER_KEY_AAD);
  const wrappedMasterKeyWithRecovery = await encryptBytes(masterKey, recoveryWrapKey, MASTER_KEY_AAD);
  const createdAt = new Date().toISOString();

  const stored: StoredKeyring = {
    version: 1,
    kdf: "argon2id",
    saltBase64: "",
    recoverySaltBase64: bytesToBase64(recoverySalt),
    wrappedMasterKeyBase64: "",
    wrappedMasterKeyWithDeviceBase64: bytesToBase64(wrappedMasterKeyWithDevice),
    wrappedMasterKeyWithRecoveryBase64: bytesToBase64(wrappedMasterKeyWithRecovery),
    createdAt
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  localStorage.setItem(DEVICE_UNLOCK_KEY, bytesToBase64(deviceKey));

  return {
    masterKey,
    recoveryKey,
    createdAt
  };
}

export async function unlockWithDevice(): Promise<Uint8Array> {
  const stored = requireKeyring();
  const deviceKeyBase64 = localStorage.getItem(DEVICE_UNLOCK_KEY);

  if (!deviceKeyBase64 || !stored.wrappedMasterKeyWithDeviceBase64) {
    throw new Error("Sessao local indisponivel. Use a chave de recuperacao.");
  }

  return decryptBytes(base64ToBytes(stored.wrappedMasterKeyWithDeviceBase64), base64ToBytes(deviceKeyBase64), MASTER_KEY_AAD);
}

export async function unlockWithPassword(password: string): Promise<Uint8Array> {
  const stored = requireKeyring();
  const passwordKey = await deriveMasterKey(password, base64ToBytes(stored.saltBase64));
  return decryptBytes(base64ToBytes(stored.wrappedMasterKeyBase64), passwordKey, MASTER_KEY_AAD);
}

export async function unlockWithRecoveryKey(recoveryKey: string): Promise<Uint8Array> {
  const stored = requireKeyring();
  const recoveryWrapKey = await deriveMasterKey(recoveryKey.trim(), base64ToBytes(stored.recoverySaltBase64));
  const masterKey = await decryptBytes(base64ToBytes(stored.wrappedMasterKeyWithRecoveryBase64), recoveryWrapKey, MASTER_KEY_AAD);
  await enableDeviceUnlock(masterKey);
  return masterKey;
}

export function getRecoveryKeyPackage(): RecoveryKeyPackage {
  const stored = requireKeyring();

  return {
    version: 1,
    kdf: "argon2id",
    recoverySaltBase64: stored.recoverySaltBase64,
    wrappedMasterKeyWithRecoveryBase64: stored.wrappedMasterKeyWithRecoveryBase64,
    createdAt: stored.createdAt
  };
}

export async function importRecoveryKeyPackage(packageValue: RecoveryKeyPackage, recoveryKey: string): Promise<Uint8Array> {
  const recoveryWrapKey = await deriveMasterKey(recoveryKey.trim(), base64ToBytes(packageValue.recoverySaltBase64));
  const masterKey = await decryptBytes(
    base64ToBytes(packageValue.wrappedMasterKeyWithRecoveryBase64),
    recoveryWrapKey,
    MASTER_KEY_AAD
  );

  const stored: StoredKeyring = {
    version: 1,
    kdf: "argon2id",
    saltBase64: "",
    recoverySaltBase64: packageValue.recoverySaltBase64,
    wrappedMasterKeyBase64: "",
    wrappedMasterKeyWithRecoveryBase64: packageValue.wrappedMasterKeyWithRecoveryBase64,
    createdAt: packageValue.createdAt
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  await enableDeviceUnlock(masterKey);
  return masterKey;
}

async function enableDeviceUnlock(masterKey: Uint8Array): Promise<void> {
  const stored = requireKeyring();
  const deviceKey = randomBytes(32);
  const wrappedMasterKeyWithDevice = await encryptBytes(masterKey, deviceKey, MASTER_KEY_AAD);

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...stored,
      wrappedMasterKeyWithDeviceBase64: bytesToBase64(wrappedMasterKeyWithDevice)
    } satisfies StoredKeyring)
  );
  localStorage.setItem(DEVICE_UNLOCK_KEY, bytesToBase64(deviceKey));
}

function requireKeyring(): StoredKeyring {
  const stored = getStoredKeyring();

  if (!stored) {
    throw new Error("Cofre local ainda nao foi configurado.");
  }

  return stored;
}

function assertStrongEnough(password: string): void {
  if (password.length < 10) {
    throw new Error("Use uma senha com pelo menos 10 caracteres.");
  }
}
