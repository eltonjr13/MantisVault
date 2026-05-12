import { maskEmail, maskPhone, safeTitle } from "../utils/safe-metadata";

export type ContactInput = {
  id?: string;
  displayName?: string;
  phones?: string[];
  emails?: string[];
};

export class ContactNormalizer {
  parseVcf(buffer: Buffer): Array<{ sourceId: string; title: string; metadata: Record<string, unknown> }> {
    const text = buffer.toString("utf8");
    return text
      .split(/END:VCARD/i)
      .map((entry, index) => normalizeVcfEntry(entry, index))
      .filter((entry): entry is { sourceId: string; title: string; metadata: Record<string, unknown> } => Boolean(entry));
  }

  normalizeJson(contacts: ContactInput[]): Array<{ sourceId: string; title: string; metadata: Record<string, unknown> }> {
    return contacts.map((contact, index) => ({
      sourceId: contact.id ?? `contact-${index}`,
      title: safeTitle(contact.displayName, "Contato"),
      metadata: {
        displayName: safeTitle(contact.displayName, "Contato"),
        phones: (contact.phones ?? []).map(maskPhone),
        emails: (contact.emails ?? []).map(maskEmail)
      }
    }));
  }
}

function normalizeVcfEntry(entry: string, index: number): { sourceId: string; title: string; metadata: Record<string, unknown> } | undefined {
  if (!entry.includes("BEGIN:VCARD")) {
    return undefined;
  }

  const fullName = readVcfValue(entry, "FN") ?? readVcfValue(entry, "N") ?? "Contato";
  const emails = [...entry.matchAll(/^EMAIL[^:]*:(.+)$/gim)].map((match) => maskEmail(match[1].trim()));
  const phones = [...entry.matchAll(/^TEL[^:]*:(.+)$/gim)].map((match) => maskPhone(match[1].trim()));

  return {
    sourceId: readVcfValue(entry, "UID") ?? `vcf-contact-${index}`,
    title: safeTitle(fullName, "Contato"),
    metadata: {
      displayName: safeTitle(fullName, "Contato"),
      emails,
      phones
    }
  };
}

function readVcfValue(entry: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, "im");
  return entry.match(pattern)?.[1]?.trim();
}
