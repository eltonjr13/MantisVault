import type { OptimizationMode, OptimizationStrategy } from "@kazvault/shared";
import type { StrategyDecision } from "./optimizer.types";

const TEXT_EXTENSIONS = new Set(["txt", "json", "csv", "xml", "html", "css", "js", "ts", "tsx", "jsx", "md", "sql", "log", "yml", "yaml"]);
const JPEG_EXTENSIONS = new Set(["jpg", "jpeg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "mkv", "avi"]);
const PRECOMPRESSED_EXTENSIONS = new Set(["zip", "rar", "7z", "gz", "br", "xz", "webp", "avif", "mp3", "aac", "opus"]);

export function getStrategy(fileName: string, mimeType = "", mode: OptimizationMode = "lossless-safe"): StrategyDecision {
  const extension = getExtension(fileName);
  const normalizedMime = mimeType.toLowerCase();

  if (mode === "visual-economy") {
    return decision(mode, "skip", "disabled", false, "Economia Visual esta desativada por padrao.", [
      "Pode reduzir qualidade quando for implementado."
    ]);
  }

  if (TEXT_EXTENSIONS.has(extension) || normalizedMime.startsWith("text/")) {
    return decision(mode, mode === "lossless-archive" ? "xz" : "zstd", mode === "lossless-archive" ? "XZ/LZMA2" : "Zstandard", true, "Texto/codigo selecionado para compressao sem perda.", []);
  }

  if (JPEG_EXTENSIONS.has(extension) || normalizedMime === "image/jpeg") {
    return decision(mode, "jpeg-xl-lossless", "JPEG XL Lossless", true, "JPEG usa transcodificacao lossless quando cjxl/djxl estao disponiveis.", []);
  }

  if (extension === "png" || normalizedMime === "image/png") {
    return decision(mode, "png-lossless", "PNG Lossless", true, "PNG usa oxipng quando disponivel.", []);
  }

  if (extension === "pdf" || normalizedMime === "application/pdf") {
    return decision(mode, "pdf-lossless", "PDF Lossless", true, "PDF usa qpdf quando disponivel.", []);
  }

  if (VIDEO_EXTENSIONS.has(extension) || normalizedMime.startsWith("video/")) {
    return decision(mode, "mp4-remux", "MP4 Remux", extension === "mp4", "Video nunca sera reencodado no modo sem perda.", []);
  }

  if (PRECOMPRESSED_EXTENSIONS.has(extension)) {
    return decision(mode, "skip", "Original Preservado", false, "Arquivo ja otimizado/comprimido.", []);
  }

  return decision(mode, mode === "lossless-archive" ? "xz" : "zstd", mode === "lossless-archive" ? "XZ/LZMA2" : "Zstandard", true, "Tipo desconhecido: tentar compressao sem perda e aceitar somente com ganho real.", []);
}

function decision(
  mode: OptimizationMode,
  strategy: OptimizationStrategy,
  algorithm: string,
  shouldAttempt: boolean,
  reason: string,
  warnings: string[]
): StrategyDecision {
  return { mode, strategy, algorithm, shouldAttempt, reason, warnings };
}

function getExtension(fileName: string): string {
  const normalized = fileName.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1) : "";
}
