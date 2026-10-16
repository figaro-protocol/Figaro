"use client";

/**
 * HashVerifier — in-browser hash verification for the audit-bundle pipeline.
 *
 * Phase E of the financial-statements deliverable. Auditors / reviewers
 * paste content (an Agreement JSON, a single clause, or a raw hash) and
 * see what it anchors to:
 *
 *   • Mode A — Agreement: paste a full Agreement JSON, recompute its
 *     merkle root, optionally compare to an expected `agreementHash`.
 *
 *   • Mode B — Clause: paste a single `AgreementClause` JSON, recompute
 *     its leaf hash, optionally compare to an expected leaf.
 *
 *   • Mode C — Search: paste any hex hash (e.g. from the audit-bundle
 *     PDF's hash appendix); the component searches the locally-loaded
 *     orders + agreements and reports which event field / clause / leaf
 *     matches it. Used both standalone (auditor with a hash but no
 *     process) and inside `/audit/view?process=<processId>` (search scoped to the
 *     wallet's visible orders, including the current process).
 *
 * No server round-trip; all computation is client-side via the same
 * `computeAgreementHash` / `computeClauseLeaf` SDK functions the protocol
 * uses internally — verifiability follows from using the canonical
 * functions, not a re-implementation.
 */
import { useState, useMemo } from "react";
import {
    computeAgreementHash,
    computeProvenanceLeaf,
    computeClauseLeaf,
    type Agreement,
    type AgreementClause,
} from "@figaro-protocol/sdk";
import { useWalletOrders } from "@/hooks/useProcessOrders";
import { useProcessAgreements } from "@/hooks/useProcessAgreements";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual } from "@/lib/shared/evm";

type Mode = "agreement" | "clause" | "search";

export function HashVerifier() {
    const [mode, setMode] = useState<Mode>("agreement");

    return (
        <div className="space-y-6" data-testid="verify-page">
            <header className="space-y-2">
                <p className="text-xs font-semibold text-ink-muted">
                    Verification
                </p>
                <h2 className="text-xl font-bold text-ink-primary">Audit-bundle hash verifier</h2>
                <p className="text-sm text-ink-body max-w-2xl">
                    All computation is client-side via the same SDK
                    functions the protocol uses internally — verifiability
                    follows from using the canonical functions, not a
                    re-implementation.
                </p>
            </header>

            <nav className="flex gap-2 border-b border-default" data-testid="verify-mode-tabs">
                {(["agreement", "clause", "search"] as const).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        data-testid={`verify-mode-${m}`}
                        className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 ${
                            mode === m
                                ? "border-ink-heading text-ink-primary"
                                : "border-transparent text-ink-muted hover:text-ink-primary"
                        }`}
                    >
                        {m === "agreement" ? "A. Agreement" : m === "clause" ? "B. Clause" : "C. Search"}
                    </button>
                ))}
            </nav>

            {mode === "agreement" && <AgreementMode />}
            {mode === "clause" && <ClauseMode />}
            {mode === "search" && <SearchMode />}
        </div>
    );
}

// ── Result display ─────────────────────────────────────────────────────────

function HashResult({ computed, expected, label }: {
    computed: string | undefined;
    expected: string;
    label: string;
}) {
    if (!computed) return null;
    const match = expected.length > 0 && hexEqual(computed, expected);
    return (
        <div
            className="rounded border border-default bg-subtle p-4 space-y-2"
            data-testid="verify-result"
        >
            <p className="text-[11px] font-semibold text-ink-muted">
                {label}
            </p>
            <p className="text-xs font-mono break-all" data-testid="verify-result-computed">{computed}</p>
            {expected.length > 0 && (
                <div
                    className={`text-xs font-semibold ${match ? "text-success-fg" : "text-error-fg"}`}
                    data-testid="verify-result-status"
                >
                    {match ? "✓ Matches expected hash" : "✗ Does not match expected hash"}
                </div>
            )}
        </div>
    );
}

function ErrorBox({ message }: { message: string }) {
    return (
        <div className="rounded border border-error/30 bg-error/10 p-4 text-xs text-error-fg" data-testid="verify-error">
            {message}
        </div>
    );
}

// ── Mode A — Agreement ─────────────────────────────────────────────────────

function AgreementMode() {
    const [json, setJson] = useState("");
    const [expected, setExpected] = useState("");

    const result = useMemo(() => {
        if (!json.trim()) return { kind: "idle" as const };
        try {
            const parsed = JSON.parse(json) as Agreement;
            if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) {
                return { kind: "error" as const, message: "Parsed JSON is not an Agreement (missing clauses array)." };
            }
            // Every clause is cleartext ({ clause, data }) — the IPFS body
            // carries them all. Selective disclosure is a merkle inclusion proof,
            // not a redacted agreement form.
            for (const s of parsed.sections as AgreementClause[]) {
                if (!s || typeof s !== "object" || typeof s.clause !== "string") {
                    return { kind: "error" as const, message: "Each clause must have a string `clause` field." };
                }
                if (typeof s.data !== "object") {
                    return { kind: "error" as const, message: `Section "${s.clause}" missing data field.` };
                }
            }
            const hash = computeAgreementHash(parsed);
            return { kind: "ok" as const, hash };
        } catch (e) {
            return { kind: "error" as const, message: extractErrorMessage(e, "JSON parse failed.") };
        }
    }, [json]);

    return (
        <div className="space-y-4" data-testid="verify-agreement-mode">
            <p className="text-xs text-ink-body">
                Paste an `Agreement` JSON (the off-chain document referenced by `agreementHash`).
                The recomputed merkle root is shown below — compare to the on-chain
                `OrderCommitted.agreementHash` event field.
            </p>
            <label className="block text-xs font-semibold text-ink-body">
                Agreement JSON
                <textarea
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                    rows={12}
                    placeholder='{"version":"a1","buyer":"0x...","seller":"0x...","sections":[...]}'
                    data-testid="verify-agreement-input"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-default rounded"
                />
            </label>
            <label className="block text-xs font-semibold text-ink-body">
                Expected agreementHash (optional)
                <input
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                    placeholder="0x…"
                    data-testid="verify-agreement-expected"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-default rounded"
                />
            </label>
            {result.kind === "error" && <ErrorBox message={result.message} />}
            {result.kind === "ok" && (
                <HashResult computed={result.hash} expected={expected.trim()} label="Recomputed agreement merkle root" />
            )}
        </div>
    );
}

// ── Mode B — Clause leaf ──────────────────────────────────────────────────

function ClauseMode() {
    const [json, setJson] = useState("");
    const [expected, setExpected] = useState("");

    const result = useMemo(() => {
        if (!json.trim()) return { kind: "idle" as const };
        try {
            const parsed = JSON.parse(json) as AgreementClause;
            if (!parsed || typeof parsed !== "object" || typeof parsed.clause !== "string" || typeof parsed.data !== "object") {
                return {
                    kind: "error" as const,
                    message: "Parsed JSON is not a single AgreementClause ({ clause: string, data: object }).",
                };
            }
            return { kind: "ok" as const, hash: computeClauseLeaf(parsed) };
        } catch (e) {
            return { kind: "error" as const, message: extractErrorMessage(e, "JSON parse failed.") };
        }
    }, [json]);

    return (
        <div className="space-y-4" data-testid="verify-section-mode">
            <p className="text-xs text-ink-body">
                Paste a single `AgreementClause` JSON (one clause from an
                agreement, e.g. a commerce clauseEntry). The recomputed
                leaf hash is shown below — compare to the clause&apos;s leaf in
                the audit-bundle hash appendix.
            </p>
            <label className="block text-xs font-semibold text-ink-body">
                Section JSON
                <textarea
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                    rows={8}
                    placeholder='{"clause":"0x<clause key>","data":{"currency":"0x...","payment":"100","lineItems":[...]}}'
                    data-testid="verify-section-input"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-default rounded"
                />
            </label>
            <label className="block text-xs font-semibold text-ink-body">
                Expected leaf hash (optional)
                <input
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                    placeholder="0x…"
                    data-testid="verify-section-expected"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-default rounded"
                />
            </label>
            {result.kind === "error" && <ErrorBox message={result.message} />}
            {result.kind === "ok" && (
                <HashResult computed={result.hash} expected={expected.trim()} label="Recomputed clause leaf hash" />
            )}
        </div>
    );
}

// ── Mode C — Hash search ───────────────────────────────────────────────────

interface HashHit {
    kind: "agreementHash" | "clause-leaf" | "provenance-leaf" | "orderHash" | "processId";
    label: string;
    location: string;
}

function SearchMode() {
    const [hash, setHash] = useState("");
    const orders = useWalletOrders(); // every order the connected wallet is a party to
    const agreementHashes = useMemo(
        () => orders.map((o) => o.agreementHash).filter((h): h is string => Boolean(h)),
        [orders],
    );
    const agreements = useProcessAgreements(agreementHashes);

    const hits = useMemo<HashHit[]>(() => {
        const target = hash.trim().toLowerCase();
        if (!target) return [];

        const found: HashHit[] = [];
        for (const order of orders) {
            if (hexEqual(order.orderHash, target)) {
                found.push({
                    kind: "orderHash",
                    label: `Order hash for buyer ${order.buyer} ↔ seller ${order.seller}`,
                    location: `OrderCommitted.orderHash on FigaroCore (orderStatus[${order.orderHash}] = ${order.state})`,
                });
            }
            if (hexEqual(order.processId, target)) {
                found.push({
                    kind: "processId",
                    label: `Process id (root buyer: ${order.buyer})`,
                    location: `OrderCommitted.processId / FigaroCore.processes[${order.processId}]`,
                });
            }
            if (hexEqual(order.agreementHash, target)) {
                found.push({
                    kind: "agreementHash",
                    label: `Agreement merkle root (order ${order.orderHash})`,
                    location: `OrderCommitted.agreementHash event field`,
                });
            }
            // Walk each order's hydrated agreement and see if any clause leaf matches.
            const agreement = order.agreementHash
                ? (agreements.get(order.agreementHash) ?? null)
                : null;
            if (agreement) {
                for (const clauseEntry of agreement.sections) {
                    if (hexEqual(computeClauseLeaf(clauseEntry), target)) {
                        found.push({
                            kind: "clause-leaf",
                            label: `Clause leaf — ${clauseEntry.clause}`,
                            location: `Merkle leaf under agreementHash ${order.agreementHash} (order ${order.orderHash})`,
                        });
                    }
                }
                // The agreement format's provenance leaf — a leaf of the same
                // tree, under the reserved key, never a clause.
                if (agreement.provenance !== undefined
                    && hexEqual(computeProvenanceLeaf(agreement.provenance.agreementKey, agreement.provenance.compositionHash), target)) {
                    found.push({
                        kind: "provenance-leaf",
                        label: `Provenance leaf — agreement ${agreement.provenance.agreementKey} in assembly ${agreement.provenance.compositionHash}`,
                        location: `Merkle leaf under agreementHash ${order.agreementHash} (order ${order.orderHash})`,
                    });
                }
            }
        }
        return found;
    }, [hash, orders, agreements]);

    return (
        <div className="space-y-4" data-testid="verify-search-mode">
            <p className="text-xs text-ink-body">
                Paste any hex hash from an audit bundle. The search walks orders
                + agreements available to the connected wallet and reports what
                each match anchors to. Use this to chase a hash from the bundle
                PDF&apos;s hash appendix to its on-chain source.
            </p>
            <label className="block text-xs font-semibold text-ink-body">
                Hash to look up
                <input
                    value={hash}
                    onChange={(e) => setHash(e.target.value)}
                    placeholder="0x…"
                    data-testid="verify-search-input"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-default rounded"
                />
            </label>
            {hash.trim() && hits.length === 0 && (
                <div className="rounded border border-default bg-subtle p-4 text-xs text-ink-body" data-testid="verify-search-no-hits">
                    No match in locally-loaded orders + agreements. Try modes A or B
                    with the hash&apos;s source content, or open the relevant process
                    audit first with the process-ID field above.
                </div>
            )}
            {hits.length > 0 && (
                <div className="space-y-2" data-testid="verify-search-results">
                    <p className="text-[11px] font-semibold text-ink-muted">
                        {hits.length} match{hits.length > 1 ? "es" : ""}
                    </p>
                    {hits.map((hit, i) => (
                        <div
                            key={i}
                            className="rounded border border-success/30 bg-success/10 p-4 space-y-1"
                            data-testid={`verify-search-hit-${i}`}
                        >
                            <p className="text-[10px] font-semibold text-success-fg">{hit.kind}</p>
                            <p className="text-xs font-semibold text-ink-primary">{hit.label}</p>
                            <p className="text-[11px] text-ink-body">{hit.location}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
