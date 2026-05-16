export function decodeGmailAttachmentData(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function collectGmailAttachmentParts(payload: any): Array<{
  partId: string;
  filename: string;
  mimeType?: string;
  attachmentId: string;
  sizeBytes: number;
}> {
  const out: Array<{ partId: string; filename: string; mimeType?: string; attachmentId: string; sizeBytes: number }> = [];
  const stack = [...(payload?.parts ?? [])];

  while (stack.length > 0) {
    const part = stack.shift();

    if (part?.body?.attachmentId && part.filename) {
      out.push({
        partId: String(part.partId ?? part.filename),
        filename: String(part.filename),
        mimeType: part.mimeType,
        attachmentId: String(part.body.attachmentId),
        sizeBytes: Number(part.body.size ?? 0)
      });
    }

    if (Array.isArray(part?.parts)) {
      stack.push(...part.parts);
    }
  }

  return out;
}
