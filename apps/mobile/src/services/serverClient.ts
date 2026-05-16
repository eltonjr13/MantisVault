import type {
  AuthSession,
  PairPayload,
  UploadChunkResponse,
  UploadCompleteResponse,
  UploadInitRequest,
  UploadInitResponse,
  VaultFileManifestResponse,
  VaultFileRecord,
  VaultSettings,
  VaultStats
} from "@kazvault/shared";
import {
  clearAuthSession,
  loadAuthSession,
  replaceAuthSession,
  saveAuthSession,
  type StoredAuthSession
} from "./pairing";

export interface RemoteVaultKeyring {
  version: 1;
  kdf: "argon2id";
  recoverySaltBase64: string;
  wrappedMasterKeyWithRecoveryBase64: string;
  createdAt: string;
}

export interface PairQrResponse {
  payload: PairPayload;
  connectUrl: string;
  mobileUrl: string;
  refreshSeconds: number;
  qrText: string;
  qrDataUrl: string;
}

export interface PairStatus {
  active: boolean;
  confirmed: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
  expiresAt?: string;
}

export type ConnectorType =
  | "local-files"
  | "android-files"
  | "mobile-contacts"
  | "mobile-calendar"
  | "gmail"
  | "outlook"
  | "imap"
  | "manual-import";

export type ConnectorStatus = "disconnected" | "connecting" | "connected" | "syncing" | "error" | "revoked";

export type ConnectorSourceType =
  | "file"
  | "email"
  | "email-attachment"
  | "contact"
  | "calendar-event"
  | "photo"
  | "video"
  | "document";

export interface ConnectorRecord {
  id: string;
  type: ConnectorType;
  name: string;
  accountIdentifier?: string;
  status: ConnectorStatus;
  syncCursor?: string;
  lastSyncAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorItemRecord {
  id: string;
  connectorId: string;
  sourceId: string;
  sourceType: ConnectorSourceType;
  title?: string;
  mimeType?: string;
  originalSize?: number;
  originalHash?: string;
  storedFileId?: string;
  manifestId?: string;
  importedAt: string;
  updatedAt?: string;
  deletedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorCapability {
  type: ConnectorType;
  name: string;
  available: boolean;
  localFirst: boolean;
  encryptedCredentials: boolean;
  env?: Record<string, boolean>;
  notes?: string[];
}

export interface ConnectorSyncResult {
  connectorId: string;
  jobId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  scanned: number;
  imported: number;
  skipped: number;
  failed: number;
  bytesImported: number;
  nextCursor?: string;
  warnings: string[];
  errors: string[];
}

export type EmailVaultImportance = "high" | "medium" | "low";
export type EmailVaultCleanupAction = "move-to-trash" | "delete-permanently" | "remove-attachments";

export interface EmailVaultAttachmentCandidate {
  id: string;
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
  important: boolean;
  reasons: string[];
}

export interface EmailVaultCandidate {
  id: string;
  connectorId: string;
  provider: "gmail" | "outlook" | "imap";
  messageId: string;
  subject: string;
  from?: string;
  date?: string;
  sizeBytes: number;
  attachmentBytes: number;
  attachments: EmailVaultAttachmentCandidate[];
  importance: EmailVaultImportance;
  reasons: string[];
  cleanupActions: EmailVaultCleanupAction[];
  archived: boolean;
  archivedItemId?: string;
  labels?: string[];
}

export interface EmailVaultPlan {
  connectorId: string;
  provider: "gmail" | "outlook" | "imap";
  query: string;
  scanned: number;
  candidates: EmailVaultCandidate[];
  totalBytes: number;
  estimatedFreeableBytes: number;
  warnings: string[];
}

export interface EmailVaultArchiveResult {
  connectorId: string;
  archived: number;
  skipped: number;
  failed: number;
  bytesArchived: number;
  items: Array<{
    messageId: string;
    itemId: string;
    storedFileId?: string;
    type: "email" | "attachment";
    title: string;
    sizeBytes?: number;
  }>;
  warnings: string[];
  errors: string[];
}

export interface EmailVaultCleanupResult {
  connectorId: string;
  action: EmailVaultCleanupAction;
  cleaned: number;
  skipped: number;
  failed: number;
  warnings: string[];
  errors: string[];
}

export type StoragePoolMode = "single" | "pooled-capacity" | "mirrored" | "hybrid";
export type StoragePoolStatus = "active" | "readonly" | "degraded" | "error" | "disabled";
export type StorageLocationStatus = "online" | "offline" | "readonly" | "full" | "error";
export type DiskHardwareHealthStatus = "healthy" | "warning" | "critical" | "unknown";

export interface DiskHardwareHealth {
  id: string;
  label: string;
  model?: string;
  serialNumber?: string;
  mediaType?: string;
  busType?: string;
  sizeBytes?: number;
  status: DiskHardwareHealthStatus;
  statusLabel: string;
  operationalStatus: string[];
  driveLetters: string[];
  source: "windows-storage" | "win32-diskdrive";
  checkedAt: string;
  warning?: string;
}

export interface DiskHealthReport {
  supported: boolean;
  checkedAt: string;
  source: "windows-storage" | "win32-diskdrive" | "unsupported";
  disks: DiskHardwareHealth[];
  warnings: string[];
}

export interface StoragePool {
  id: string;
  name: string;
  mode: StoragePoolMode;
  quotaBytes: number;
  usedBytes: number;
  reservedFreeBytes: number;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
  status: StoragePoolStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StorageLocation {
  id: string;
  poolId: string;
  label: string;
  rootPath: string;
  quotaBytes: number;
  usedBytes: number;
  reservedFreeBytes: number;
  status: StorageLocationStatus;
  priority: number;
  isSystemDrive: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
}

export interface StorageUsage {
  pool: StoragePool;
  usefulCapacityBytes: number;
  availableBytes: number;
  usedPercent: number;
  alerts: Array<{ code: string; severity: "info" | "warning" | "critical"; message: string; locationId?: string }>;
  locations: Array<{ location: StorageLocation; availableBytes: number; usedPercent: number }>;
}

export interface CreateStoragePoolRequest {
  name: string;
  mode: StoragePoolMode;
  quotaBytes: number;
  reservedFreeBytes: number;
  warningThresholdPercent?: number;
  criticalThresholdPercent?: number;
  locations: Array<{ label: string; rootPath: string; quotaBytes: number; reservedFreeBytes: number }>;
}

export async function fetchPairPayload(baseUrl: string): Promise<PairPayload> {
  return (await fetchPairQr(baseUrl)).payload;
}

export async function fetchPairQr(baseUrl: string, fresh = false): Promise<PairQrResponse> {
  const url = new URL(`${trimSlash(baseUrl)}/api/pair/qr`);

  if (fresh) {
    url.searchParams.set("fresh", "1");
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  return (await parseResponse(response)) as PairQrResponse;
}

export async function getPairStatus(baseUrl: string, token: string): Promise<PairStatus> {
  const url = new URL(`${trimSlash(baseUrl)}/api/pair/status`);
  url.searchParams.set("token", token);

  const response = await fetch(url.toString(), { cache: "no-store" });
  return (await parseResponse(response)) as PairStatus;
}

export async function confirmPairing(pairing: PairPayload): Promise<PairPayload> {
  const deviceName = navigator.userAgent.includes("Android") ? "Android" : "Celular";

  const response = await fetch(`${trimSlash(pairing.baseUrl)}/api/pair/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      token: pairing.token,
      deviceName
    })
  });

  const body = (await parseResponse(response)) as { authSession?: AuthSession };

  if (!body.authSession) {
    return pairing;
  }

  return saveAuthSession(pairing, body.authSession);
}

export async function initUpload(pairing: PairPayload, request: UploadInitRequest): Promise<UploadInitResponse> {
  return requestJson<UploadInitResponse>(pairing, "/api/uploads/init", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function uploadChunk(input: {
  pairing: PairPayload;
  uploadId: string;
  index: number;
  bytes: Uint8Array;
  sha256: string;
  plainChunkSha256?: string;
  signal?: AbortSignal;
}): Promise<UploadChunkResponse> {
  const body = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength
  ) as ArrayBuffer;

  const headers: Record<string, string> = {
    "content-type": "application/octet-stream",
    "x-chunk-sha256": input.sha256
  };

  if (input.plainChunkSha256) {
    headers["x-kazvault-plain-chunk-sha256"] = input.plainChunkSha256;
  }

  return requestJson<UploadChunkResponse>(input.pairing, `/api/uploads/${input.uploadId}/chunk/${input.index}`, {
    method: "PATCH",
    body,
    signal: input.signal,
    headers
  });
}

export async function completeUpload(pairing: PairPayload, uploadId: string): Promise<UploadCompleteResponse> {
  return requestJson<UploadCompleteResponse>(pairing, `/api/uploads/${uploadId}/complete`, {
    method: "POST"
  });
}

export async function getVaultStats(pairing: PairPayload): Promise<VaultStats> {
  return requestJson<VaultStats>(pairing, "/api/vault/stats", {
    method: "GET"
  });
}

export async function getVaultSettings(pairing: PairPayload): Promise<VaultSettings> {
  return requestJson<VaultSettings>(pairing, "/api/vault/settings", {
    method: "GET"
  });
}

export async function updateVaultSettings(pairing: PairPayload, settings: VaultSettings): Promise<VaultSettings> {
  return requestJson<VaultSettings>(pairing, "/api/vault/settings", {
    method: "PUT",
    body: JSON.stringify(settings)
  });
}

export async function getRemoteVaultKeyring(pairing: PairPayload): Promise<RemoteVaultKeyring | undefined> {
  try {
    return await requestJson<RemoteVaultKeyring>(pairing, "/api/vault/keyring", {
      method: "GET"
    });
  } catch (reason) {
    if (reason instanceof Error && reason.message.includes("HTTP 404")) {
      return undefined;
    }

    throw reason;
  }
}

export async function saveRemoteVaultKeyring(pairing: PairPayload, keyring: RemoteVaultKeyring): Promise<void> {
  await requestJson(pairing, "/api/vault/keyring", {
    method: "PUT",
    body: JSON.stringify(keyring)
  });
}

export async function listFiles(pairing: PairPayload): Promise<VaultFileRecord[]> {
  const response = await requestJson<{ files: VaultFileRecord[] }>(pairing, "/api/files", {
    method: "GET"
  });

  return response.files;
}

export async function getFileManifest(pairing: PairPayload, fileId: string): Promise<VaultFileManifestResponse> {
  return requestJson<VaultFileManifestResponse>(pairing, `/api/files/${fileId}/manifest`, {
    method: "GET"
  });
}

export async function downloadChunk(pairing: PairPayload, fileId: string, index: number): Promise<Uint8Array> {
  return requestBytes(pairing, `/api/files/${fileId}/chunks/${index}`, {
    method: "GET"
  });
}

export async function deleteFile(pairing: PairPayload, fileId: string): Promise<void> {
  await requestJson(pairing, `/api/files/${fileId}`, {
    method: "DELETE"
  });
}

export async function listConnectors(pairing: PairPayload): Promise<ConnectorRecord[]> {
  const response = await requestJson<{ connectors: ConnectorRecord[] }>(pairing, "/api/connectors", {
    method: "GET"
  });

  return response.connectors;
}

export async function getConnectorCapabilities(pairing: PairPayload): Promise<ConnectorCapability[]> {
  const response = await requestJson<{ capabilities: ConnectorCapability[] }>(pairing, "/api/connectors/capabilities", {
    method: "GET"
  });

  return response.capabilities;
}

export async function getConnectorItems(pairing: PairPayload, connectorId: string): Promise<ConnectorItemRecord[]> {
  const response = await requestJson<{ items: ConnectorItemRecord[] }>(pairing, `/api/connectors/${connectorId}/items`, {
    method: "GET"
  });

  return response.items;
}

export async function startConnectorSync(pairing: PairPayload, connectorId: string, body: {
  fullSync?: boolean;
  cursor?: string;
  limit?: number;
  dryRun?: boolean;
} = {}): Promise<ConnectorSyncResult> {
  return requestJson<ConnectorSyncResult>(pairing, `/api/connectors/${connectorId}/sync`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function planEmailVault(pairing: PairPayload, connectorId: string, body: {
  query?: string;
  olderThanDays?: number;
  minSizeBytes?: number;
  limit?: number;
  includeAlreadyArchived?: boolean;
} = {}): Promise<EmailVaultPlan> {
  return requestJson(pairing, `/api/connectors/${connectorId}/email-vault/plan`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function archiveEmailVault(pairing: PairPayload, connectorId: string, body: {
  messageIds: string[];
  includeAttachments?: boolean;
  includeRawEmail?: boolean;
}): Promise<EmailVaultArchiveResult> {
  return requestJson(pairing, `/api/connectors/${connectorId}/email-vault/archive`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function cleanupEmailVault(pairing: PairPayload, connectorId: string, body: {
  messageIds: string[];
  action: EmailVaultCleanupAction;
  confirmation: "ARCHIVE_VERIFIED";
}): Promise<EmailVaultCleanupResult> {
  return requestJson(pairing, `/api/connectors/${connectorId}/email-vault/cleanup`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function disconnectConnector(pairing: PairPayload, connectorId: string, deleteData = false): Promise<void> {
  await requestJson(pairing, `/api/connectors/${connectorId}/disconnect`, {
    method: "POST",
    body: JSON.stringify({ deleteData })
  });
}

export async function startGmailConnector(pairing: PairPayload): Promise<{ authUrl: string }> {
  return requestJson(pairing, "/api/connectors/gmail/start", {
    method: "POST"
  });
}

export async function connectImapConnector(pairing: PairPayload, input: {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  appPassword: string;
}): Promise<ConnectorRecord> {
  return requestJson(pairing, "/api/connectors/imap/connect", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function importContactsVcf(pairing: PairPayload, input: { file: File; deviceId: string }): Promise<ConnectorSyncResult> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("deviceId", input.deviceId);

  return requestJson(pairing, "/api/connectors/mobile-contacts/import-vcf", {
    method: "POST",
    body
  });
}

export async function importContactsJson(pairing: PairPayload, input: {
  deviceId: string;
  contacts: Array<{ id?: string; displayName?: string; phones?: string[]; emails?: string[] }>;
}): Promise<ConnectorSyncResult> {
  return requestJson(pairing, "/api/connectors/mobile-contacts/import-json", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function importCalendarIcs(pairing: PairPayload, input: { file: File; deviceId: string }): Promise<ConnectorSyncResult> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("deviceId", input.deviceId);

  return requestJson(pairing, "/api/connectors/mobile-calendar/import-ics", {
    method: "POST",
    body
  });
}

export async function importCalendarJson(pairing: PairPayload, input: {
  deviceId: string;
  events: Array<{ id?: string; title?: string; start?: string; end?: string; location?: string }>;
}): Promise<ConnectorSyncResult> {
  return requestJson(pairing, "/api/connectors/mobile-calendar/import-json", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listStoragePools(pairing: PairPayload): Promise<StoragePool[]> {
  const response = await requestJson<{ pools: StoragePool[] }>(pairing, "/api/storage/pools", {
    method: "GET"
  });

  return response.pools;
}

export async function createStoragePool(pairing: PairPayload, request: CreateStoragePoolRequest): Promise<{
  pool: StoragePool;
  locations: StorageLocation[];
  warnings: string[];
}> {
  return requestJson(pairing, "/api/storage/pools", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function updateStoragePool(pairing: PairPayload, poolId: string, patch: Partial<CreateStoragePoolRequest>): Promise<{
  pool: StoragePool;
}> {
  return requestJson(pairing, `/api/storage/pools/${poolId}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

export async function getStoragePool(pairing: PairPayload, poolId: string): Promise<{ pool: StoragePool; locations: StorageLocation[] }> {
  return requestJson(pairing, `/api/storage/pools/${poolId}`, {
    method: "GET"
  });
}

export async function getStorageUsage(pairing: PairPayload, poolId: string): Promise<StorageUsage> {
  return requestJson(pairing, `/api/storage/pools/${poolId}/usage`, {
    method: "GET"
  });
}

export async function checkStorageHealth(pairing: PairPayload, poolId: string): Promise<{
  pool: StoragePool;
  locations: Array<StorageLocation & { disk?: { totalBytes: number; availableBytes: number; usedBytes: number; hardwareHealth?: DiskHardwareHealth } }>;
  alerts: StorageUsage["alerts"];
}> {
  return requestJson(pairing, `/api/storage/pools/${poolId}/health`, {
    method: "GET"
  });
}

export async function checkDiskHealth(pairing: PairPayload): Promise<DiskHealthReport> {
  return requestJson(pairing, "/api/storage/disks/health", {
    method: "GET"
  });
}

export async function addStorageLocation(pairing: PairPayload, poolId: string, input: {
  label: string;
  rootPath: string;
  quotaBytes: number;
  reservedFreeBytes: number;
}): Promise<{ location: StorageLocation; warnings: string[] }> {
  return requestJson(pairing, `/api/storage/pools/${poolId}/locations`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function planStorageRebalance(pairing: PairPayload, poolId: string): Promise<unknown> {
  return requestJson(pairing, `/api/storage/pools/${poolId}/rebalance/plan`, {
    method: "POST"
  });
}

async function requestJson<T>(pairing: PairPayload, path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !(init.body instanceof Uint8Array) && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetchWithSession(pairing, path, init, headers);

  return parseResponse(response) as Promise<T>;
}

async function requestBytes(pairing: PairPayload, path: string, init: RequestInit): Promise<Uint8Array> {
  const headers = new Headers(init.headers);

  const response = await fetchWithSession(pairing, path, init, headers);

  if (!response.ok) {
    await parseResponse(response);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function fetchWithSession(
  pairing: PairPayload,
  path: string,
  init: RequestInit,
  headers: Headers
): Promise<Response> {
  const response = await fetchWithToken(pairing, path, init, headers, await getRequestToken(pairing));

  if (response.status !== 401) {
    return response;
  }

  const session = loadAuthSession(pairing.baseUrl);

  if (!session) {
    return response;
  }

  const refreshed = await refreshAuthSession(session).catch(() => {
    clearAuthSession();
    return undefined;
  });

  return refreshed ? fetchWithToken(pairing, path, init, headers, refreshed.accessToken) : response;
}

async function fetchWithToken(
  pairing: PairPayload,
  path: string,
  init: RequestInit,
  headers: Headers,
  token: string
): Promise<Response> {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("x-kazvault-token", token);

  return fetch(`${trimSlash(pairing.baseUrl)}${path}`, {
    ...init,
    headers: nextHeaders
  });
}

async function getRequestToken(pairing: PairPayload): Promise<string> {
  const session = loadAuthSession(pairing.baseUrl);

  if (!session) {
    return pairing.token;
  }

  if (!isExpiringSoon(session.accessTokenExpiresAt)) {
    return session.accessToken;
  }

  const refreshed = await refreshAuthSession(session).catch(() => {
    clearAuthSession();
    return undefined;
  });

  return refreshed?.accessToken ?? pairing.token;
}

async function refreshAuthSession(session: StoredAuthSession): Promise<StoredAuthSession> {
  const response = await fetch(`${trimSlash(session.baseUrl)}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      refreshToken: session.refreshToken
    })
  });
  const body = (await parseResponse(response)) as { authSession?: AuthSession };

  if (!body.authSession) {
    throw new Error("Sessao invalida.");
  }

  const next: StoredAuthSession = {
    ...body.authSession,
    baseUrl: session.baseUrl,
    serverName: session.serverName,
    fingerprint: session.fingerprint
  };

  replaceAuthSession(next);
  window.dispatchEvent(new CustomEvent("kazvault:session-refreshed", { detail: { baseUrl: next.baseUrl } }));
  return next;
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    if (typeof body === "object" && body && "error" in body) {
      const nested = (body as { error: unknown }).error;

      if (typeof nested === "object" && nested && "message" in nested) {
        throw new Error(String((nested as { message: unknown }).message));
      }
    }

    const message =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function isExpiringSoon(value: string): boolean {
  return new Date(value).getTime() - Date.now() < 60_000;
}
