/**
 * @figaro/sdk/signer — the rolling spend window.
 *
 * An append-only JSONL journal the signer owns. Replayed at start so a
 * restart cannot reset the per-period ceiling — the window survives the
 * process, which is what makes the ceiling a bound rather than a suggestion.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SpentWindow } from "./gate.js";

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
            for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
                if (!line.trim()) continue;
                try {
                    const e = JSON.parse(line) as JournalEntry;
                    if (typeof e.ts === "number" && typeof e.token === "string" && typeof e.native === "string") {
                        this.entries.push(e);
                    }
                } catch {
                    // A torn tail line (crash mid-append) is dropped; every
                    // complete line still counts.
                }
            }
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
