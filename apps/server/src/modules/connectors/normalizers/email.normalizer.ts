import { maskEmail, safeTitle } from "../utils/safe-metadata";

export type NormalizedEmail = {
  sourceId: string;
  title: string;
  date?: string;
  hasAttachments: boolean;
  metadata: Record<string, unknown>;
};

export class EmailNormalizer {
  normalizeGmailMessage(message: {
    id?: string | null;
    internalDate?: string | null;
    payload?: { headers?: Array<{ name?: string | null; value?: string | null }>; parts?: unknown[] };
  }): NormalizedEmail {
    const headers = new Map(
      (message.payload?.headers ?? []).map((header) => [String(header.name ?? "").toLowerCase(), String(header.value ?? "")])
    );
    const from = headers.get("from");

    return {
      sourceId: message.id ?? `gmail-${Date.now()}`,
      title: safeTitle(headers.get("subject"), "Email"),
      date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : headers.get("date"),
      hasAttachments: Boolean(message.payload?.parts?.length),
      metadata: {
        subject: safeTitle(headers.get("subject"), "Email"),
        from: from ? maskPossibleEmail(from) : undefined,
        date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : headers.get("date"),
        hasAttachments: Boolean(message.payload?.parts?.length)
      }
    };
  }
}

function maskPossibleEmail(value: string): string {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? maskEmail(match[0]) : "[masked-email]";
}
