import { extname } from "node:path";
import type { EmailVaultAttachmentCandidate, EmailVaultImportance } from "./connectors.types";

const IMPORTANT_KEYWORDS = [
  "contrato",
  "nota fiscal",
  "nfe",
  "nf-e",
  "boleto",
  "recibo",
  "pagamento",
  "invoice",
  "receipt",
  "documento",
  "assinatura",
  "proposta",
  "comprovante",
  "declaração",
  "declaracao"
];

const LOW_VALUE_KEYWORDS = [
  "promo",
  "promocao",
  "promoção",
  "newsletter",
  "oferta",
  "sale",
  "desconto",
  "cupom",
  "unsubscribe"
];

const IMPORTANT_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".xml",
  ".zip",
  ".7z",
  ".rar",
  ".ofx",
  ".qif",
  ".pfx",
  ".p12"
]);

export function buildEmailVaultQuery(input: {
  query?: string;
  olderThanDays?: number;
  minSizeBytes?: number;
}): string {
  if (input.query?.trim()) {
    return input.query.trim();
  }

  const olderThanDays = clampInteger(input.olderThanDays, 1, 3650, 180);
  const minimumMegabytes = Math.max(1, Math.ceil((input.minSizeBytes ?? 5 * 1024 * 1024) / 1024 / 1024));

  return `has:attachment larger:${minimumMegabytes}M older_than:${olderThanDays}d`;
}

export function classifyEmailCandidate(input: {
  subject: string;
  from?: string;
  labels?: string[];
  attachments: EmailVaultAttachmentCandidate[];
}): { importance: EmailVaultImportance; reasons: string[] } {
  const reasons: string[] = [];
  const haystack = `${input.subject} ${input.from ?? ""}`.toLowerCase();
  const labels = new Set((input.labels ?? []).map((label) => label.toUpperCase()));
  let score = 0;

  if (labels.has("STARRED") || labels.has("IMPORTANT")) {
    score += 4;
    reasons.push("Marcado como importante/estrela.");
  }

  if (labels.has("CATEGORY_PROMOTIONS") || labels.has("CATEGORY_SOCIAL")) {
    score -= 2;
    reasons.push("Categoria social/promocional.");
  }

  if (IMPORTANT_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    score += 3;
    reasons.push("Assunto/remetente parece conter documento importante.");
  }

  if (LOW_VALUE_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    score -= 2;
    reasons.push("Assunto/remetente parece promocional.");
  }

  const importantAttachments = input.attachments.filter((attachment) => attachment.important);

  if (importantAttachments.length > 0) {
    score += Math.min(3, importantAttachments.length);
    reasons.push("Anexos com extensao documental/importante.");
  }

  if (input.attachments.length === 0) {
    score -= 1;
    reasons.push("Sem anexo detectado.");
  }

  if (reasons.length === 0) {
    reasons.push("Candidato por tamanho/idade.");
  }

  if (score >= 3) {
    return { importance: "high", reasons };
  }

  if (score <= -2) {
    return { importance: "low", reasons };
  }

  return { importance: "medium", reasons };
}

export function classifyAttachment(fileName: string, mimeType?: string): { important: boolean; reasons: string[] } {
  const extension = extname(fileName).toLowerCase();
  const reasons: string[] = [];
  let important = false;

  if (IMPORTANT_EXTENSIONS.has(extension)) {
    important = true;
    reasons.push("Extensao documental/importante.");
  }

  if (mimeType?.includes("pdf") || mimeType?.includes("spreadsheet") || mimeType?.includes("document")) {
    important = true;
    reasons.push("Tipo MIME documental.");
  }

  if (!important) {
    reasons.push("Anexo pesado para arquivamento.");
  }

  return { important, reasons };
}

export function clampEmailVaultLimit(value: number | undefined): number {
  return clampInteger(value, 1, 100, 25);
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isInteger(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Number(value)));
}
