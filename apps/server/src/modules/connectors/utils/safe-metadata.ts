export function maskEmail(value: string): string {
  const [local, domain] = value.split("@");

  if (!local || !domain) {
    return "[masked-email]";
  }

  if (local.length <= 2) {
    return `${local[0] ?? "*"}***@${domain}`;
  }

  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length <= 5) {
    return "***";
  }

  return `${digits.slice(0, 2)}*****${digits.slice(-3)}`;
}

export function safeTitle(value: string | undefined, fallback = "Importado"): string {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 160) : fallback;
}

export function omitSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => omitSecrets(item)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const out: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase();

    if (
      lowered.includes("token") ||
      lowered.includes("secret") ||
      lowered.includes("password") ||
      lowered === "code" ||
      lowered.includes("authorization")
    ) {
      out[key] = "[omitted]";
    } else {
      out[key] = omitSecrets(item);
    }
  }

  return out as T;
}
