import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import type { CommandResult } from "./optimizer.types";

export function runCommand(binary: string, args: string[], options: { timeoutMs?: number; stdoutPath?: string } = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const output = options.stdoutPath ? createWriteStream(options.stdoutPath) : undefined;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs ?? 120_000);

    child.stdout.on("data", (chunk: Buffer) => {
      if (output) {
        output.write(chunk);
      } else {
        stdout.push(chunk);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      output?.end();
      resolve({
        binary,
        args,
        exitCode: null,
        stdout: "",
        stderr: error.message,
        timedOut
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      output?.end();
      resolve({
        binary,
        args,
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut
      });
    });
  });
}
