/**
 * @figaro-protocol/sdk/signer — where the signer keeps its files.
 *
 * The socket, the spend journal and the audit log live in ONE directory that
 * is the signer's alone. The journal is what makes the per-period ceiling a
 * bound, and the audit log is the owner's record: a process the signer gates
 * must not be able to write either, so the directory is never one a sandbox
 * grants its agent (a temp directory, the workspace). The sandbox launcher
 * denies writes to this directory by name; the signer refuses one that other
 * users can write.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface SignerPaths {
    socketPath: string;
    auditPath: string;
    journalPath: string;
}

/** The signer's directory under the owner's home when none is named. */
export const SIGNER_DIRNAME = ".figaro-signer";

/**
 * Resolve the three paths: one directory, `<home>/.figaro-signer` unless
 * `dir` names another or a named socket's directory is taken as the
 * signer's. The audit log and the journal always sit beside the socket — the
 * sandbox protects the socket's directory, and nothing else.
 */
export function resolveSignerPaths(
    args: { dir?: string; socket?: string },
    home: string,
): SignerPaths {
    const dir = args.socket ? path.dirname(args.socket) : (args.dir ?? path.join(home, SIGNER_DIRNAME));
    return {
        socketPath: args.socket ?? path.join(dir, "signer.sock"),
        auditPath: path.join(dir, "audit.jsonl"),
        journalPath: path.join(dir, "window.jsonl"),
    };
}

/**
 * Create `dir` for the owner alone when it is missing, and refuse it when it
 * is not this user's, or when group or others can write it (a shared temp
 * directory). Throws with the reason.
 */
export function assertPrivateDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (process.platform === "win32") return;
    const st = fs.statSync(dir);
    const own = `the signer's socket, spend journal and audit log need a directory of the signer's own (default ~/${SIGNER_DIRNAME})`;
    if (typeof process.getuid === "function" && st.uid !== process.getuid()) {
        throw new Error(`${dir} belongs to another user — ${own}`);
    }
    if (st.mode & 0o022) {
        throw new Error(`${dir} is writable by other users — ${own}`);
    }
}

/** Refuse the three files split across directories. */
export function assertOneDir(paths: SignerPaths): void {
    const dirs = new Set([paths.socketPath, paths.auditPath, paths.journalPath].map((p) => path.resolve(path.dirname(p))));
    if (dirs.size !== 1) {
        throw new Error("the signer's socket, audit log and spend journal must share one directory — the sandbox protects the socket's directory, and nothing else");
    }
}
