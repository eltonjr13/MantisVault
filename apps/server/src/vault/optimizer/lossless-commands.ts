import type { OptimizationStrategy } from "@kazvault/shared";

export function buildLosslessCommand(strategy: OptimizationStrategy, inputPath: string, outputPath: string): { binary: string; args: string[]; stdoutPath?: string } | undefined {
  switch (strategy) {
    case "zstd":
      return { binary: "zstd", args: ["-q", "-f", "-o", outputPath, inputPath] };
    case "xz":
      return { binary: "xz", args: ["-k", "-f", "-9", "--stdout", inputPath], stdoutPath: outputPath };
    case "brotli":
      return { binary: "brotli", args: ["-f", "-q", "11", "-o", outputPath, inputPath] };
    case "jpeg-xl-lossless":
      return { binary: "cjxl", args: ["--lossless_jpeg=1", inputPath, outputPath] };
    case "jpegtran-lossless":
      return { binary: "jpegtran", args: ["-copy", "all", "-optimize", "-progressive", "-outfile", outputPath, inputPath] };
    case "png-lossless":
      return { binary: "oxipng", args: ["-o", "max", "--strip", "safe", "--out", outputPath, inputPath] };
    case "pdf-lossless":
      return { binary: "qpdf", args: ["--object-streams=generate", "--compress-streams=y", inputPath, outputPath] };
    case "mp4-remux":
      return { binary: "ffmpeg", args: ["-y", "-i", inputPath, "-map", "0", "-c", "copy", "-map_metadata", "0", "-movflags", "+faststart", outputPath] };
    default:
      return undefined;
  }
}
