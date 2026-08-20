/**
 * @figaro-protocol/sdk/signer — the audit log.
 *
 * Every request, decision, and reason, appended as one JSONL line to a file
 * the owner reads. The log carries WHAT was decided and WHY — never key
 * material, never a signature (a signature in a log is a signature at rest
 * outside the wire it was meant for).
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface AuditEntry {
    ts: string;
    op: string;
    allow: boolean;
    reason: string;
    /** Request identity for correlation — a digest or target, never payload. */
    subject?: string;
    riskToken?: string;
    riskNative?: string;
}

export function appendAudit(file: string, entry: AuditEntry): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
}
