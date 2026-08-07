"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/** The spectator's front door to the full process audit: paste a process ID,
 *  open `/audit/view?process=<id>` — no wallet, no account, anyone's deal. */
export function ProcessAuditOpen() {
    const router = useRouter();
    const [processId, setProcessId] = useState("");
    const trimmed = processId.trim();
    const valid = /^0x[0-9a-fA-F]{64}$/.test(trimmed);

    return (
        <form
            className="flex flex-wrap items-end gap-3"
            data-testid="process-audit-open"
            onSubmit={(e) => {
                e.preventDefault();
                if (valid) router.push(`/audit/view?process=${trimmed}`);
            }}
        >
            <label className="grow min-w-64 block text-sm text-ink-body">
                Process ID
                <input
                    type="text"
                    value={processId}
                    onChange={(e) => setProcessId(e.target.value)}
                    placeholder="0x…"
                    data-testid="process-audit-input"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-neutral-300 rounded"
                />
            </label>
            <Button type="submit" disabled={!valid} data-testid="process-audit-go">
                Open the process audit
            </Button>
        </form>
    );
}
