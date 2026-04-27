"use client";

/**
 * /verify — in-browser hash verification for the audit-bundle pipeline.
 *
 * Phase E of the financial-statements deliverable. Auditors / reviewers
 * paste content (an Agreement JSON, a single section, or a raw hash) and
 * see what it anchors to:
 *
 *   • Mode A — Agreement: paste a full Agreement JSON, recompute its
 *     merkle root, optionally compare to an expected `agreementHash`.
 *
 *   • Mode B — Section: paste a single `AgreementSection` JSON, recompute
 *     its leaf hash, optionally compare to an expected leaf.
 *
 *   • Mode C — Search: paste any hex hash (e.g. from the audit-bundle
 *     PDF's hash appendix); the page searches the locally-loaded
 *     orders + agreements and reports which event field / section / leaf
 *     matches it. Useful when an auditor has the PDF in hand and wants
 *     to chase a hash to its on-chain anchor without re-reading the
 *     whole bundle.
 *
 * No server round-trip; all computation is client-side via the same
 * `computeAgreementHash` / `computeSectionLeaf` SDK functions the protocol
 * uses internally — verifiability follows from using the canonical
 * functions, not a re-implementation.
 */
import { useState, useMemo } from "react";
import {
    computeAgreementHash,
    computeSectionLeaf,
    type Agreement,
    type AgreementSection,
} from "@/lib/core/agreementManifest";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { loadAgreement } from "@/lib/core/agreementStore";

type Mode = "agreement" | "section" | "search";

export default function VerifyPage() {
    const [mode, setMode] = useState<Mode>("agreement");

    return (
        <div className="container mx-auto px-6 py-10 max-w-3xl space-y-8" data-testid="verify-page">
            <header className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Verification
                </p>
                <h1 className="text-2xl font-bold text-black">Audit-bundle hash verifier</h1>
                <p className="text-sm text-neutral-700 max-w-2xl">
                    Paste content or a hash from an audit bundle to verify against
                    chain. All computation is client-side via the same SDK
                    functions the protocol uses internally — verifiability
                    follows from using the canonical functions, not a
                    re-implementation.
                </p>
            </header>

            <nav className="flex gap-2 border-b border-neutral-200" data-testid="verify-mode-tabs">
                {(["agreement", "section", "search"] as const).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        data-testid={`verify-mode-${m}`}
                        className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 ${
                            mode === m
                                ? "border-black text-black"
                                : "border-transparent text-neutral-500 hover:text-black"
                        }`}
                    >
                        {m === "agreement" ? "A. Agreement" : m === "section" ? "B. Section" : "C. Search"}
                    </button>
                ))}
            </nav>

            {mode === "agreement" && <AgreementMode />}
            {mode === "section" && <SectionMode />}
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
    const match = expected.length > 0 && computed.toLowerCase() === expected.toLowerCase();
    return (
        <div
            className="rounded border border-neutral-200 bg-neutral-50 p-4 space-y-2"
            data-testid="verify-result"
        >
            <p className="text-[11px] uppercase font-semibold tracking-wider text-neutral-500">
                {label}
            </p>
            <p className="text-xs font-mono break-all" data-testid="verify-result-computed">{computed}</p>
            {expected.length > 0 && (
                <div
                    className={`text-xs font-semibold ${match ? "text-green-700" : "text-red-700"}`}
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
        <div className="rounded border border-red-200 bg-red-50 p-4 text-xs text-red-800" data-testid="verify-error">
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
                return { kind: "error" as const, message: "Parsed JSON is not an Agreement (missing sections array)." };
            }
            return { kind: "ok" as const, hash: computeAgreementHash(parsed) };
        } catch (e) {
            return { kind: "error" as const, message: e instanceof Error ? e.message : "JSON parse failed." };
        }
    }, [json]);

    return (
        <div className="space-y-4" data-testid="verify-agreement-mode">
            <p className="text-xs text-neutral-600">
                Paste an `Agreement` JSON (the off-chain document referenced by `agreementHash`).
                The recomputed merkle root is shown below — compare to the on-chain
                `OrderCommitted.agreementHash` event field.
            </p>
            <label className="block text-xs font-semibold text-neutral-700">
                Agreement JSON
                <textarea
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                    rows={12}
                    placeholder='{"version":"a1","buyer":"0x...","seller":"0x...","sections":[...]}'
                    data-testid="verify-agreement-input"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-neutral-300 rounded"
                />
            </label>
            <label className="block text-xs font-semibold text-neutral-700">
                Expected agreementHash (optional)
                <input
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                    placeholder="0x…"
                    data-testid="verify-agreement-expected"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-neutral-300 rounded"
                />
            </label>
            {result.kind === "error" && <ErrorBox message={result.message} />}
            {result.kind === "ok" && (
                <HashResult computed={result.hash} expected={expected.trim()} label="Recomputed agreement merkle root" />
            )}
        </div>
    );
}

// ── Mode B — Section leaf ──────────────────────────────────────────────────

function SectionMode() {
    const [json, setJson] = useState("");
    const [expected, setExpected] = useState("");

    const result = useMemo(() => {
        if (!json.trim()) return { kind: "idle" as const };
        try {
            const parsed = JSON.parse(json) as AgreementSection;
            if (!parsed || typeof parsed !== "object" || typeof parsed.schema !== "string" || typeof parsed.data !== "object") {
                return {
                    kind: "error" as const,
                    message: "Parsed JSON is not a single AgreementSection ({ schema: string, data: object }).",
                };
            }
            return { kind: "ok" as const, hash: computeSectionLeaf(parsed) };
        } catch (e) {
            return { kind: "error" as const, message: e instanceof Error ? e.message : "JSON parse failed." };
        }
    }, [json]);

    return (
        <div className="space-y-4" data-testid="verify-section-mode">
            <p className="text-xs text-neutral-600">
                Paste a single `AgreementSection` JSON (one clause from an
                agreement, e.g. the figaro-commerce-v1 section). The recomputed
                leaf hash is shown below — compare to the section&apos;s leaf in
                the audit-bundle hash appendix.
            </p>
            <label className="block text-xs font-semibold text-neutral-700">
                Section JSON
                <textarea
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                    rows={8}
                    placeholder='{"schema":"figaro-commerce-v1","data":{"currency":"0x...","payment":"100","lineItems":[...]}}'
                    data-testid="verify-section-input"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-neutral-300 rounded"
                />
            </label>
            <label className="block text-xs font-semibold text-neutral-700">
                Expected leaf hash (optional)
                <input
                    value={expected}
                    onChange={(e) => setExpected(e.target.value)}
                    placeholder="0x…"
                    data-testid="verify-section-expected"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-neutral-300 rounded"
                />
            </label>
            {result.kind === "error" && <ErrorBox message={result.message} />}
            {result.kind === "ok" && (
                <HashResult computed={result.hash} expected={expected.trim()} label="Recomputed section leaf hash" />
            )}
        </div>
    );
}

// ── Mode C — Hash search ───────────────────────────────────────────────────

interface HashHit {
    kind: "agreementHash" | "section-leaf" | "orderHash" | "processId";
    label: string;
    location: string;
}

function SearchMode() {
    const [hash, setHash] = useState("");
    const orders = useProcessOrders(null); // all orders the wallet can see

    const hits = useMemo<HashHit[]>(() => {
        const target = hash.trim().toLowerCase();
        if (!target) return [];

        const found: HashHit[] = [];
        for (const order of orders) {
            if (order.id.toLowerCase() === target) {
                found.push({
                    kind: "orderHash",
                    label: `Order hash for buyer ${order.buyer} ↔ seller ${order.seller}`,
                    location: `OrderCommitted.orderHash on FigaroCore (orderStatus[${order.id}] = ${order.state})`,
                });
            }
            if (order.processId.toLowerCase() === target) {
                found.push({
                    kind: "processId",
                    label: `Process id (root buyer: ${order.buyer})`,
                    location: `OrderCommitted.processId / FigaroCore.processes[${order.processId}]`,
                });
            }
            if (order.agreementHash && order.agreementHash.toLowerCase() === target) {
                found.push({
                    kind: "agreementHash",
                    label: `Agreement merkle root (order ${order.id})`,
                    location: `OrderCommitted.agreementHash event field`,
                });
            }
            // Walk each order's locally-cached agreement and see if any section leaf matches.
            const agreement = loadAgreement(order.agreementHash);
            if (agreement) {
                for (const section of agreement.sections) {
                    if (computeSectionLeaf(section).toLowerCase() === target) {
                        found.push({
                            kind: "section-leaf",
                            label: `Section leaf — ${section.schema}`,
                            location: `Merkle leaf under agreementHash ${order.agreementHash} (order ${order.id})`,
                        });
                    }
                }
            }
        }
        return found;
    }, [hash, orders]);

    return (
        <div className="space-y-4" data-testid="verify-search-mode">
            <p className="text-xs text-neutral-600">
                Paste any hex hash from an audit bundle. The search walks orders
                + agreements available to the connected wallet and reports what
                each match anchors to. Use this to chase a hash from the bundle
                PDF&apos;s hash appendix to its on-chain source.
            </p>
            <label className="block text-xs font-semibold text-neutral-700">
                Hash to look up
                <input
                    value={hash}
                    onChange={(e) => setHash(e.target.value)}
                    placeholder="0x…"
                    data-testid="verify-search-input"
                    className="mt-1 w-full font-mono text-xs px-3 py-2 border border-neutral-300 rounded"
                />
            </label>
            {hash.trim() && hits.length === 0 && (
                <div className="rounded border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600" data-testid="verify-search-no-hits">
                    No match in locally-loaded orders + agreements. Try modes A or B
                    with the hash&apos;s source content, or load the relevant
                    process via /financials/[processId] first.
                </div>
            )}
            {hits.length > 0 && (
                <div className="space-y-2" data-testid="verify-search-results">
                    <p className="text-[11px] uppercase font-semibold tracking-wider text-neutral-500">
                        {hits.length} match{hits.length > 1 ? "es" : ""}
                    </p>
                    {hits.map((hit, i) => (
                        <div
                            key={i}
                            className="rounded border border-green-200 bg-green-50 p-4 space-y-1"
                            data-testid={`verify-search-hit-${i}`}
                        >
                            <p className="text-[10px] uppercase font-semibold tracking-wider text-green-800">{hit.kind}</p>
                            <p className="text-xs font-semibold text-black">{hit.label}</p>
                            <p className="text-[11px] text-neutral-600">{hit.location}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
