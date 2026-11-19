"use client";

/**
 * KeptPrivateContentPanel — the connected wallet's own copies of private
 * witness content, as this browser keeps them for it on this chain
 * (`lib/composition/witnessContent.ts`): the content of its private filings,
 * and the copies it received from a counterparty. Three controls, each the
 * holder's own act: export them to a file it keeps, import such a file back
 * (each entry checked again against its fingerprint), and remove them from
 * this browser. No page shows these copies to another wallet; the bytes
 * still sit in this browser's storage until the holder removes them.
 *
 * Names no clause, prints no content: it counts entries.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
    countHeldWitnessContent,
    exportKeptWitnessContent,
    forgetHeldWitnessContent,
    importKeptWitnessContent,
    type WitnessHolder,
} from "@/lib/composition/witnessContent";
import { Button } from "@/components/ui/Button";
import { CeremonyPanelFrame } from "@/components/runtime/CeremonyPanelFrame";

interface Props {
    holder: WitnessHolder;
    /** Bumps when another panel keeps more copies, so the count is read again. */
    refreshKey?: number;
    /** Called after an import or a removal changed what the holder keeps. */
    onChanged?: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function KeptPrivateContentPanel({ holder, refreshKey = 0, onChanged }: Props) {
    const [count, setCount] = useState(() => countHeldWitnessContent(holder));
    const [note, setNote] = useState<string | null>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setCount(countHeldWitnessContent(holder));
    }, [holder, refreshKey]);

    const handleExport = useCallback(() => {
        const text = exportKeptWitnessContent(holder);
        if (!text) return;
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `figaro-private-filings-${holder.chainId}-${holder.address.slice(0, 10).toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setNote(`Exported ${plural(count, "entry", "entries")}. The file holds the content in plaintext: keep it where only you can open it.`);
    }, [holder, count]);

    const handleImport = useCallback(async (file: File) => {
        const result = importKeptWitnessContent(holder, await file.text());
        setNote(result.refusal ?? `Imported ${plural(result.kept, "entry", "entries")}${result.dropped > 0 ? `; ${plural(result.dropped, "entry", "entries")} failed a check and ${result.dropped === 1 ? "was" : "were"} dropped` : ""}.`);
        setCount(countHeldWitnessContent(holder));
        onChanged?.();
    }, [holder, onChanged]);

    const handleRemove = useCallback(() => {
        const removed = forgetHeldWitnessContent(holder);
        setConfirmRemove(false);
        setNote(`Removed ${plural(removed, "entry", "entries")} from this browser.`);
        setCount(0);
        onChanged?.();
    }, [holder, onChanged]);

    return (
        <CeremonyPanelFrame testId="kept-private-content-panel" title="Your private content in this browser">
            <p className="text-xs text-ink-body" data-testid="kept-private-content-count">
                This browser keeps {plural(count, "private filing", "private filings")} for your wallet on this chain:
                the content behind the fingerprints on the chain, which you need to show a forum what you attested.
                No page shows it to another wallet. Export it to keep it; remove it from a browser others use.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button type="button" size="compact" variant="outline" onClick={handleExport} disabled={count === 0} data-testid="kept-private-content-export" className="py-1.5 rounded">
                    Export
                </Button>
                <Button type="button" size="compact" variant="outline" onClick={() => fileInput.current?.click()} data-testid="kept-private-content-import" className="py-1.5 rounded">
                    Import a file
                </Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    data-testid="kept-private-content-file"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void handleImport(file);
                    }}
                />
                {confirmRemove ? (
                    <Button type="button" size="compact" variant="destructive" onClick={handleRemove} data-testid="kept-private-content-remove-confirm" className="py-1.5 rounded">
                        Remove {plural(count, "entry", "entries")}: only an export keeps them
                    </Button>
                ) : (
                    <Button type="button" size="compact" variant="outline" onClick={() => setConfirmRemove(true)} disabled={count === 0} data-testid="kept-private-content-remove" className="py-1.5 rounded">
                        Remove from this browser
                    </Button>
                )}
            </div>
            {note && <p className="text-xs text-ink-body" data-testid="kept-private-content-note">{note}</p>}
        </CeremonyPanelFrame>
    );
}
