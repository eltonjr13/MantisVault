import type { OptimizerConfig } from "./optimizer.types";

export function loadOptimizerConfig(): OptimizerConfig {
  return {
    minimumGainPercent: readNumber("MIN_OPTIMIZATION_GAIN_PERCENT", 2),
    commandTimeoutMs: readNumber("OPTIMIZER_COMMAND_TIMEOUT_MS", 120_000)
  };
}

function readNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
