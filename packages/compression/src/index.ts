import { unzlibSync, zlibSync } from "fflate";
import type { CompressionDecision, CompressionInput } from "@kazvault/shared";
import type { CompressionAlgorithm } from "@kazvault/shared";

const LOW_GAIN_EXTENSIONS = new Set([
  "webp",
  "mp3",
  "aac",
  "opus",
  "zip",
  "rar",
  "7z",
  "gz",
  "br",
  "xz",
  "avif",
  "docx",
  "xlsx"
]);

const JPEG_EXTENSIONS = new Set(["jpg", "jpeg"]);
const PNG_EXTENSIONS = new Set(["png"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "mkv", "avi"]);

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
const MINIMUM_GAIN_PERCENT = readMinimumGainPercent();

export function chooseCompressionMode(input: CompressionInput): CompressionDecision {
  const ext = getExtension(input.fileName);
  const mimeType = input.mimeType?.toLowerCase() ?? "";
  const batteryLow = input.battery ? input.battery.level < 0.2 && !input.battery.charging : false;
  const saveData = Boolean(input.network?.saveData);
  const slowNetwork = ["slow-2g", "2g", "3g"].includes(input.network?.effectiveType ?? "");

  if (JPEG_EXTENSIONS.has(ext)) {
    return {
      ...baseDecision("skip", "store", 0),
      strategy: "jpeg-xl-lossless",
      shouldAttempt: false,
      userMessage: "JPEG ja e comprimido; otimização lossless externa sera usada somente quando disponivel no PC.",
      reason: "Compressao generica ignorada para preservar qualidade e evitar ganho irrelevante."
    };
  }

  if (PNG_EXTENSIONS.has(ext)) {
    return {
      ...baseDecision("skip", "store", 0),
      strategy: "png-lossless",
      shouldAttempt: false,
      userMessage: "PNG sera preservado; otimização lossless externa pode ser aplicada no PC com oxipng.",
      reason: "Compressao generica ignorada para nao alterar estrutura do PNG sem validador dedicado."
    };
  }

  if (VIDEO_EXTENSIONS.has(ext) || mimeType.startsWith("video/")) {
    return {
      ...baseDecision("skip", "store", 0),
      strategy: "mp4-remux",
      shouldAttempt: false,
      userMessage: "Video ja e comprimido; sem reencode para preservar qualidade.",
      reason: "Recompressao de video desativada no modo sem perda."
    };
  }

  if (PDF_EXTENSIONS.has(ext)) {
    return {
      ...baseDecision("balanced", "deflate-fflate", 6),
      strategy: "pdf-lossless",
      userMessage: "PDF Lossless com fallback seguro.",
      reason: "PDF pode ganhar com reorganizacao lossless no PC; no app usa compressao segura com descarte se o ganho for baixo."
    };
  }

  if (LOW_GAIN_EXTENSIONS.has(ext) || LOW_GAIN_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return {
      ...baseDecision("skip", "store", 0),
      strategy: "skip",
      shouldAttempt: false,
      userMessage: "Arquivo ja otimizado.",
      reason: "Arquivo ja comprimido; criptografia aplicada sem recompressao."
    };
  }

  if (input.sizeBytes > VERY_LARGE_FILE_BYTES || batteryLow) {
    return {
      ...baseDecision("fast", "deflate-fflate", 1),
      strategy: "zstd",
      userMessage: "Zstandard rapido com fallback seguro.",
      reason: "Arquivo grande ou bateria baixa; priorizando velocidade sem perda."
    };
  }

  if (TEXT_EXTENSIONS.has(ext) || TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    if (saveData || slowNetwork) {
      return {
        ...baseDecision("max", "deflate-fflate", 9),
        strategy: "brotli",
        userMessage: "Brotli/Zstandard para texto com fallback seguro.",
        reason: "Arquivo textual em rede limitada; priorizando menor trafego sem perda."
      };
    }

    return {
      ...baseDecision("balanced", "deflate-fflate", 6),
      strategy: "zstd",
      userMessage: "Zstandard para texto com fallback seguro.",
      reason: "Arquivo textual; compressao sem perda equilibrada."
    };
  }

  if (saveData || slowNetwork) {
    return {
      ...baseDecision("balanced", "deflate-fflate", 6),
      strategy: "zstd",
      userMessage: "Zstandard com fallback seguro.",
      reason: "Rede limitada; usando compressao sem perda equilibrada."
    };
  }

  return {
    ...baseDecision("fast", "deflate-fflate", 1),
    strategy: "zstd",
    userMessage: "Compressao sem perda com fallback seguro.",
    reason: "Tipo desconhecido; compressao conservadora aceita somente se houver ganho real."
  };
}

export async function compressBytes(bytes: Uint8Array, decision: CompressionDecision): Promise<Uint8Array> {
  if (!decision.shouldAttempt || decision.algorithm === "store" || decision.mode === "skip") {
    return bytes;
  }

  return zlibSync(bytes, { level: decision.level });
}

export async function decompressBytes(bytes: Uint8Array, algorithm: CompressionAlgorithm): Promise<Uint8Array> {
  if (algorithm === "store") {
    return bytes;
  }

  if (algorithm !== "deflate-fflate") {
    return bytes;
  }

  return unzlibSync(bytes);
}

export function calculateSavings(originalSize: number, finalSize: number): {
  savedBytes: number;
  savedPercent: number;
  accepted: boolean;
  reason: string;
} {
  const savedBytes = originalSize - finalSize;
  const savedPercent = originalSize > 0 ? (savedBytes / originalSize) * 100 : 0;

  if (finalSize >= originalSize) {
    return {
      savedBytes,
      savedPercent,
      accepted: false,
      reason: "Otimização descartada porque o arquivo final ficou maior ou igual ao original."
    };
  }

  if (savedPercent < MINIMUM_GAIN_PERCENT) {
    return {
      savedBytes,
      savedPercent,
      accepted: false,
      reason: "Otimização descartada porque a economia ficou abaixo do mínimo configurado."
    };
  }

  return {
    savedBytes,
    savedPercent,
    accepted: true,
    reason: "Otimizado sem perda."
  };
}

function baseDecision(
  mode: CompressionDecision["mode"],
  algorithm: CompressionAlgorithm,
  level: CompressionDecision["level"]
): CompressionDecision {
  return {
    mode,
    algorithm,
    level,
    optimizationMode: "lossless-safe",
    strategy: "skip",
    shouldAttempt: true,
    minimumGainPercent: MINIMUM_GAIN_PERCENT,
    userMessage: "Compressao sem perda.",
    reason: "Compressao sem perda.",
    warnings: []
  };
}

function readMinimumGainPercent(): number {
  const envValue =
    typeof globalThis !== "undefined" && "process" in globalThis
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.MIN_OPTIMIZATION_GAIN_PERCENT
      : undefined;
  const value = Number(envValue ?? "2");
  return Number.isFinite(value) && value >= 0 ? value : 2;
}

function getExtension(fileName: string): string {
  const normalized = fileName.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1) : "";
}
