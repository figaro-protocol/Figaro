/**
 * @figaro-protocol/sdk/signer — the rolling spend window.
 *
 * An append-only JSONL journal the signer owns. Replayed at start so a
 * restart cannot reset the per-period ceiling — the window survives the
 * process, which is what makes the ceiling a bound rather than a suggestion.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SpentWindow } from "./gate.js";
import { parseAmount } from "./policy.js";

interface JournalEntry {
    ts: number;
    token: string;
    native: string;
}

export class SpendJournal {
    private entries: JournalEntry[] = [];

    constructor(
        private readonly file: string,
        private readonly periodSecs: number,
    ) {
        if (fs.existsSync(file)) {
            const text = fs.readFileSync(file, "utf-8");
            const lines = text.split("\n").filter((l) => l.trim());
            lines.forEach((line, i) => {
                let e: Partial<JournalEntry> | null;
                try {
                    e = JSON.parse(line) as Partial<JournalEntry> | null;
                } catch {
                    // A torn tail line (crash mid-append) is cut off the
                    // file, so the next append starts a line of its own;
                    // every complete line still counts. Anywhere else it is
                    // damage. The journal is ASCII: characters are bytes.
                    if (i === lines.length - 1) {
                        fs.truncateSync(file, text.lastIndexOf("\n") + 1);
                        return;
                    }
                    throw new Error(`the spend journal ${file} is damaged: entry ${i + 1} does not parse`);
                }
                // Every entry is a time and two non-negative amounts. An
                // entry that is anything else — a negative amount gives spend
                // back — refuses the start: the window is the ceiling's
                // record, and a record that cannot be read whole bounds
                // nothing.
                if (
                    typeof e !== "object" || e === null
                    || typeof e.ts !== "number" || !Number.isFinite(e.ts) || e.ts < 0
                    || parseAmount(e.token) === null || parseAmount(e.native) === null
                ) {
                    throw new Error(`the spend journal ${file} is damaged: entry ${i + 1} is not a time and two non-negative amounts`);
                }
                this.entries.push({ ts: e.ts, token: e.token as string, native: e.native as string });
            });
        }
    }

    /** Totals inside the rolling window ending at `nowSecs`. */
    spent(nowSecs: number): SpentWindow {
        const cutoff = nowSecs - this.periodSecs;
        let token = 0n;
        let native = 0n;
        for (const e of this.entries) {
            if (e.ts > cutoff) {
                token += BigInt(e.token);
                native += BigInt(e.native);
            }
        }
        return { token, native };
    }

    /** Record a granted request's risk. Append-then-remember, so the on-disk
     *  journal is never behind the in-memory window. */
    record(nowSecs: number, token: bigint, native: bigint): void {
        if (token === 0n && native === 0n) return;
        const entry: JournalEntry = { ts: nowSecs, token: token.toString(), native: native.toString() };
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
        this.entries.push(entry);
    }
}
