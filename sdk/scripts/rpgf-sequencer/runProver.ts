import { spawn } from "node:child_process";
import type { ProveRequest, ProveResponse } from "./types.js";

export interface RunProverOptions {
  /** Path to prover/Cargo.toml — defaults to <repo>/prover/Cargo.toml */
  proverCargoTomlPath: string;
  /** Use --release? Defaults true (the prover is slow without it). */
  release?: boolean;
}

/**
 * Invoke figaro-rpgf-script (the host-side SP1 prover binary) as a
 * subprocess. Sends the ProveRequest on stdin as JSON; reads the
 * ProveResponse from stdout. Stderr is piped through for prover
 * progress logging.
 *
 * Slow on first run (key compilation); subsequent runs hit a cached
 * key. Real-mode proving needs the SP1 proving-network env vars
 * (`SP1_PROVER`, `NETWORK_*` etc.) — see SP1 docs.
 */
export function runProver(
  request: ProveRequest,
  opts: RunProverOptions,
): Promise<ProveResponse> {
  const args = ["run"];
  if (opts.release !== false) args.push("--release");
  args.push("--manifest-path", opts.proverCargoTomlPath);
  args.push("-p", "figaro-rpgf-script");

  return new Promise((resolve, reject) => {
    const child = spawn("cargo", args, {
      stdio: ["pipe", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`figaro-rpgf-script exited with code ${code}`));
        return;
      }
      try {
        const trimmed = stdout.trim();
        // The prover may emit progress on stderr (piped through); stdout
        // contains the JSON response on the last line.
        const lastLine = trimmed.split(/\r?\n/).pop() ?? "";
        const parsed = JSON.parse(lastLine) as ProveResponse;
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse prover response: ${e}\nstdout was:\n${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
  });
}
