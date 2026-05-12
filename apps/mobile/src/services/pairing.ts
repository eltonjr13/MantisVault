import type { PairPayload } from "@kazvault/shared";

const PAIRING_KEY = "kazvault:pairing:v1";

export function savePairing(payload: PairPayload): void {
  localStorage.setItem(PAIRING_KEY, JSON.stringify(payload));
}

export function loadPairing(): PairPayload | undefined {
  const raw = localStorage.getItem(PAIRING_KEY);
  return raw ? parsePairPayload(raw) : undefined;
}

export function clearPairing(): void {
  localStorage.removeItem(PAIRING_KEY);
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
