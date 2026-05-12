import type { OptimizationMode, OptimizationResult, OptimizationStrategy } from "@kazvault/shared";

export type { OptimizationMode, OptimizationResult, OptimizationStrategy };

export interface OptimizerConfig {
  minimumGainPercent: number;
  commandTimeoutMs: number;
}

export interface StrategyDecision {
  mode: OptimizationMode;
  strategy: OptimizationStrategy;
  algorithm: string;
  shouldAttempt: boolean;
  reason: string;
  warnings: string[];
}

export interface CommandResult {
  binary: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
