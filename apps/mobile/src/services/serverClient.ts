import type {
  PairPayload,
  UploadChunkResponse,
  UploadCompleteResponse,
  UploadInitRequest,
  UploadInitResponse,
  VaultFileRecord,
  VaultStats
} from "@kazvault/shared";

export interface RemoteVaultKeyring {
  version: 1;
  kdf: "argon2id";
  recoverySaltBase64: string;
  wrappedMasterKeyWithRecoveryBase64: string;
  createdAt: string;
}

export async function fetchPairPayload(baseUrl: string): Promise<PairPayload> {
  const response = await fetch(`${trimSlash(baseUrl)}/api/pair/qr`);
  const body = (await parseResponse(response)) as { payload: PairPayload };
  return body.payload;
}

export async function confirmPairing(pairing: PairPayload): Promise<void> {
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

  await parseResponse(response);
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
  signal?: AbortSignal;
}): Promise<UploadChunkResponse> {
  const body = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength
  ) as ArrayBuffer;

  return requestJson<UploadChunkResponse>(input.pairing, `/api/uploads/${input.uploadId}/chunk/${input.index}`, {
    method: "PATCH",
    body,
    signal: input.signal,
    headers: {
      "content-type": "application/octet-stream",
      "x-chunk-sha256": input.sha256
    }
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

export async function deleteFile(pairing: PairPayload, fileId: string): Promise<void> {
  await requestJson(pairing, `/api/files/${fileId}`, {
    method: "DELETE"
  });
}

async function requestJson<T>(pairing: PairPayload, path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-kazvault-token", pairing.token);

  if (init.body && !(init.body instanceof Uint8Array) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${trimSlash(pairing.baseUrl)}${path}`, {
    ...init,
    headers
  });

  return parseResponse(response) as Promise<T>;
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
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
