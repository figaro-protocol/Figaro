"use client";

import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import type { AttestAction } from "@figaro/core/agent";
import { useFigaro } from "@/lib/console/provider";
import { hydrateAgreement } from "@/lib/core/agreementStore";
import { computeSchemaId } from "@figaro/core/extensions";
import { extractErrorMessage } from "@/lib/shared/errors";

function shortenHex(hex: string, chars = 6): string {
    if (hex.length <= chars * 2 + 2) return hex;
    return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

interface Props {
    action: AttestAction;
    onQueue: (configured: AttestAction) => void;
}

type SchemaOption = { key: string; id: Hex };

export function AttestConfigurator({ action, onQueue }: Props) {
    const { selectedProcess } = useFigaro();
    const [targetOrderHash, setTargetOrderHash] = useState<Hex>(action.orderHashes[0]);
    const [schemas, setSchemas] = useState<SchemaOption[]>([]);
    const [schemaKey, setSchemaKey] = useState<string>("");
    const [stage, setStage] = useState<number>(1);
    const [hydrating, setHydrating] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const order = useMemo(() => {
        if (!selectedProcess) return undefined;
        return selectedProcess.orders.get(targetOrderHash);
    }, [selectedProcess, targetOrderHash]);

    useEffect(() => {
        let cancelled = false;
        if (!order) {
            setSchemas([]);
            return;
        }
        setHydrating(true);
        setLoadError(null);
        hydrateAgreement(order.agreementHash as Hex)
            .then((agreement) => {
                if (cancelled) return;
                if (!agreement) {
                    setSchemas([]);
                    setLoadError("Agreement not available locally — cannot enumerate committed clauses.");
                    return;
                }
                const opts = agreement.sections
                    .filter((s) => s.schema !== "figaro-topology-v1")
                    .map((s) => ({ key: s.schema, id: computeSchemaId(s.schema) as Hex }));
                setSchemas(opts);
                if (opts.length > 0) {
                    const preferred = opts.find((o) => o.key === "figaro-courier-process-v1") ?? opts[0];
                    setSchemaKey(preferred.key);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                setLoadError(extractErrorMessage(err, String(err)));
                setSchemas([]);
            })
            .finally(() => {
                if (!cancelled) setHydrating(false);
            });
        return () => {
            cancelled = true;
        };
    }, [order]);

    const canQueue = !!schemaKey && !hydrating;

    const handleQueue = () => {
        if (!canQueue) return;
        const schemaId = computeSchemaId(schemaKey) as Hex;
        onQueue({
            ...action,
            orderHashes: [targetOrderHash],
            schemaId,
            stage,
        });
    };

    return (
        <div className="mt-2 space-y-2 rounded border border-white/10 bg-black/10 p-2 text-xs">
            {action.orderHashes.length > 1 && (
                <label className="flex items-center gap-2">
                    <span className="w-16 opacity-70">Order</span>
                    <select
                        value={targetOrderHash}
                        onChange={(e) => setTargetOrderHash(e.target.value as Hex)}
                        className="flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 font-mono"
                    >
                        {action.orderHashes.map((h) => (
                            <option key={h} value={h}>{shortenHex(h)}</option>
                        ))}
                    </select>
                </label>
            )}
            <label className="flex items-center gap-2">
                <span className="w-16 opacity-70">Schema</span>
                <select
                    value={schemaKey}
                    onChange={(e) => setSchemaKey(e.target.value)}
                    disabled={hydrating || schemas.length === 0}
                    className="flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 font-mono disabled:opacity-50"
                >
                    {schemas.length === 0 ? (
                        <option value="">{hydrating ? "Loading…" : "No committed clauses"}</option>
                    ) : (
                        schemas.map((s) => (
                            <option key={s.key} value={s.key}>{s.key}</option>
                        ))
                    )}
                </select>
            </label>
            <label className="flex items-center gap-2">
                <span className="w-16 opacity-70">Stage</span>
                <input
                    type="number"
                    min={0}
                    max={255}
                    value={stage}
                    onChange={(e) => setStage(Math.max(0, Math.min(255, Number(e.target.value) || 0)))}
                    className="w-20 rounded border border-white/10 bg-black/30 px-2 py-1 font-mono"
                />
            </label>
            {loadError && (
                <p className="text-[10px] italic opacity-70">{loadError}</p>
            )}
            <div className="flex justify-end">
                <button
                    onClick={handleQueue}
                    disabled={!canQueue}
                    className="rounded bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20 disabled:opacity-40 transition-colors"
                >
                    Queue Attestation
                </button>
            </div>
        </div>
    );
}
