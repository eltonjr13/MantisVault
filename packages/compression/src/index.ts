import { zlibSync } from "fflate";
import type { CompressionDecision, CompressionInput } from "@kazvault/shared";

const LOW_GAIN_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "mp4",
  "mp3",
  "zip",
  "rar",
  "7z",
  "docx",
  "xlsx",
  "pdf"
]);

const TEXT_EXTENSIONS = new Set([
  "txt",
  "csv",
  "json",
  "log",
  "xml",
  "html",
  "css",
  "js",
  "ts",
  "tsx",
  "jsx",
  "md",
  "yaml",
  "yml"
]);

const LOW_GAIN_MIME_PREFIXES = ["image/", "video/", "audio/"];
const TEXT_MIME_PREFIXES = ["text/"];

const VERY_LARGE_FILE_BYTES = 512 * 1024 * 1024;
const LARGE_FILE_BYTES = 128 * 1024 * 1024;

export function chooseCompressionMode(input: CompressionInput): CompressionDecision {
  const ext = getExtension(input.fileName);
  const mimeType = input.mimeType?.toLowerCase() ?? "";
  const batteryLow = input.battery ? input.battery.level < 0.2 && !input.battery.charging : false;
  const saveData = Boolean(input.network?.saveData);
  const slowNetwork = ["slow-2g", "2g", "3g"].includes(input.network?.effectiveType ?? "");

  if (LOW_GAIN_EXTENSIONS.has(ext) || LOW_GAIN_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    if (input.sizeBytes > LARGE_FILE_BYTES || batteryLow) {
      return {
        mode: "skip",
        algorithm: "store",
        level: 0,
        reason: "Arquivo ja comprimido ou midia; ganho esperado baixo."
      };
    }

    return {
      mode: "fast",
      algorithm: "deflate-fflate",
      level: 1,
      reason: "Arquivo de baixo ganho; compressao rapida para reduzir pouco sem gastar muita bateria."
    };
  }

  if (input.sizeBytes > VERY_LARGE_FILE_BYTES || batteryLow) {
    return {
      mode: "fast",
      algorithm: "deflate-fflate",
      level: 1,
      reason: "Arquivo grande ou bateria baixa; priorizando velocidade."
    };
  }

  if (TEXT_EXTENSIONS.has(ext) || TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    if (saveData || slowNetwork) {
      return {
        mode: "max",
        algorithm: "deflate-fflate",
        level: 9,
        reason: "Arquivo textual em rede limitada; priorizando menor trafego."
      };
    }

    return {
      mode: "balanced",
      algorithm: "deflate-fflate",
      level: 6,
      reason: "Arquivo textual; compressao equilibrada."
    };
  }

  if (saveData || slowNetwork) {
    return {
      mode: "balanced",
      algorithm: "deflate-fflate",
      level: 6,
      reason: "Rede limitada; usando compressao equilibrada."
    };
  }

  return {
    mode: "fast",
    algorithm: "deflate-fflate",
    level: 1,
    reason: "Tipo desconhecido; compressao rapida conservadora."
  };
}

export async function compressBytes(bytes: Uint8Array, decision: CompressionDecision): Promise<Uint8Array> {
  if (decision.algorithm === "store" || decision.mode === "skip") {
    return bytes;
  }

  return zlibSync(bytes, { level: decision.level });
}

function getExtension(fileName: string): string {
  const normalized = fileName.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1) : "";
}
