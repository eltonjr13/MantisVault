import type { AuthSession, PairPayload } from "@kazvault/shared";

const PAIRING_KEY = "kazvault:pairing:v1";
const SESSION_KEY = "kazvault:session:v1";

export interface StoredAuthSession extends AuthSession {
  baseUrl: string;
  serverName: string;
  fingerprint: string;
}

export function savePairing(payload: PairPayload): void {
  localStorage.setItem(PAIRING_KEY, JSON.stringify(payload));
}

export function loadPairing(): PairPayload | undefined {
  const raw = localStorage.getItem(PAIRING_KEY);
  const payload = raw ? parsePairPayload(raw) : undefined;
  return payload ? applyStoredSession(payload) : undefined;
}

export function clearPairing(): void {
  localStorage.removeItem(PAIRING_KEY);
  clearAuthSession();
}

export function saveAuthSession(pairing: PairPayload, authSession: AuthSession): PairPayload {
  const stored: StoredAuthSession = {
    ...authSession,
    baseUrl: pairing.baseUrl,
    serverName: pairing.serverName,
    fingerprint: pairing.fingerprint
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  return applyStoredSession(pairing, stored);
}

export function loadAuthSession(baseUrl?: string): StoredAuthSession | undefined {
  const raw = localStorage.getItem(SESSION_KEY);

  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as StoredAuthSession;

    if (
      !parsed.baseUrl ||
      (baseUrl && trimSlash(parsed.baseUrl) !== trimSlash(baseUrl)) ||
      !parsed.accessToken ||
      !parsed.refreshToken ||
      !parsed.accessTokenExpiresAt ||
      !parsed.refreshTokenExpiresAt
    ) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

export function replaceAuthSession(authSession: StoredAuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(authSession));
}

export function clearAuthSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function applyStoredSession(payload: PairPayload, session = loadAuthSession(payload.baseUrl)): PairPayload {
  if (!session) {
    return payload;
  }

  return {
    ...payload,
    token: session.accessToken,
    expiresAt: session.accessTokenExpiresAt
  };
}

export function parsePairPayload(text: string): PairPayload {
  const normalized = text.trim();
  const encodedPayload = extractEncodedPayload(normalized);
  const parsed = JSON.parse(encodedPayload ? decodeBase64Url(encodedPayload) : normalized) as PairPayload;

  if (
    parsed.app !== "KazVault" ||
    parsed.version !== 1 ||
    !parsed.baseUrl ||
    !parsed.token ||
    !parsed.fingerprint
  ) {
    throw new Error("QR Code de pareamento invalido.");
  }

  return parsed;
}

export function readPairPayloadFromCurrentUrl(): PairPayload | undefined {
  const encodedPayload = extractEncodedPayload(window.location.href);

  if (!encodedPayload) {
    return undefined;
  }

  return parsePairPayload(decodeBase64Url(encodedPayload));
}

export function clearPairPayloadFromCurrentUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("pair");
  url.searchParams.delete("p");
  url.hash = "";
  window.history.replaceState(null, document.title, url.pathname + url.search);
}

function extractEncodedPayload(value: string): string | undefined {
  try {
    const url = new URL(value, window.location.origin);
    const searchPayload = url.searchParams.get("pair") ?? url.searchParams.get("p");

    if (searchPayload) {
      return searchPayload;
    }

    if (url.hash) {
      const hashParams = new URLSearchParams(url.hash.replace(/^#\/?\??/, ""));
      return hashParams.get("pair") ?? hashParams.get("p") ?? undefined;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}
