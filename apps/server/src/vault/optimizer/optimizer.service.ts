import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { OptimizationMode, OptimizationResult } from "@kazvault/shared";
import { getStrategy } from "./strategy-detector";
import { loadOptimizerConfig } from "./optimizer.config";
import { getAvailableOptimizers } from "./dependency-checker";
import { buildLosslessCommand } from "./lossless-commands";
import { runCommand } from "./command-runner";
import { calculateSavings } from "./savings";
import { sha256File } from "../chunks/hash.service";

export async function optimizeLocalFile(input: {
  originalName: string;
  inputPath: string;
  outputPath: string;
  mimeType?: string;
  mode?: OptimizationMode;
}): Promise<OptimizationResult> {
  const config = loadOptimizerConfig();
  const mode = input.mode ?? "lossless-safe";
  const decision = getStrategy(input.originalName, input.mimeType, mode);
  const originalSize = (await stat(input.inputPath)).size;
  const originalHash = await sha256File(input.inputPath);
  const available = await getAvailableOptimizers();
  const command = buildLosslessCommand(decision.strategy, input.inputPath, input.outputPath);
  const warnings = [...decision.warnings];

  if (!decision.shouldAttempt || !command || !available[command.binary]) {
    if (command && !available[command.binary]) {
      warnings.push(`${command.binary} nao instalado; fallback seguro preservou o original.`);
    }

    return result({
      input,
      originalSize,
      finalSize: originalSize,
      mode,
      strategy: "skip",
      algorithm: "Original Preservado",
      optimized: false,
      originalHash,
      finalHash: originalHash,
      reason: decision.reason,
      warnings
    });
  }

  const commandResult = await runCommand(command.binary, command.args, {
    timeoutMs: config.commandTimeoutMs,
    stdoutPath: command.stdoutPath
  });

  if (commandResult.exitCode !== 0) {
    warnings.push(commandResult.stderr || "Ferramenta externa falhou.");
    return result({
      input,
      originalSize,
      finalSize: originalSize,
      mode,
      strategy: "skip",
      algorithm: "Original Preservado",
      optimized: false,
      originalHash,
      finalHash: originalHash,
      reason: "Fallback seguro preservou o original.",
      warnings
    });
  }

  const finalSize = (await stat(input.outputPath)).size;
  const savings = calculateSavings(originalSize, finalSize, config.minimumGainPercent);

  if (!savings.accepted) {
    return result({
      input,
      originalSize,
      finalSize: originalSize,
      mode,
      strategy: "skip",
      algorithm: "Original Preservado",
      optimized: false,
      originalHash,
      finalHash: originalHash,
      reason: savings.reason,
      warnings
    });
  }

  return result({
    input,
    originalSize,
    finalSize,
    mode,
    strategy: decision.strategy,
    algorithm: decision.algorithm,
    optimized: true,
    originalHash,
    finalHash: await sha256File(input.outputPath),
    reason: savings.reason,
    warnings
  });
}

function result(input: {
  input: { originalName: string; inputPath: string; outputPath: string };
  originalSize: number;
  finalSize: number;
  mode: OptimizationMode;
  strategy: OptimizationResult["strategy"];
  algorithm: string;
  optimized: boolean;
  originalHash: string;
  finalHash: string;
  reason: string;
  warnings: string[];
}): OptimizationResult {
  const savedBytes = input.originalSize - input.finalSize;
  const savedPercent = input.originalSize > 0 ? (savedBytes / input.originalSize) * 100 : 0;

  return {
    fileId: randomUUID(),
    originalName: input.input.originalName,
    originalPath: input.input.inputPath,
    outputPath: input.optimized ? input.input.outputPath : input.input.inputPath,
    originalSize: input.originalSize,
    finalSize: input.finalSize,
    savedBytes,
    savedPercent,
    mode: input.mode,
    strategy: input.strategy,
    algorithm: input.algorithm,
    optimized: input.optimized,
    encrypted: false,
    deduplicated: false,
    originalHash: input.originalHash,
    finalHash: input.finalHash,
    reason: input.reason,
    warnings: input.warnings,
    createdAt: new Date().toISOString()
  };
}
