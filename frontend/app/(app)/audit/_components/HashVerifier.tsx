"use client";

/**
 * HashVerifier — in-browser hash verification for the audit-bundle pipeline.
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
 *     PDF's hash appendix); the component searches the locally-loaded
 *     orders + agreements and reports which event field / section / leaf
 *     matches it. Used both standalone (auditor with a hash but no
 *     process) and inside `/audit/[processId]` (search scoped to the
 *     wallet's visible orders, including the current process).
 *
 * No server round-trip; all computation is client-side via the same
 * `computeAgreementHash` / `computeSectionLeaf` SDK functions the protocol
 * uses internally — verifiability follows from using the canonical
 * functions, not a re-implementation.
 */
import { useState, useMemo } from "react";
import {
    computeAgreementHash,
    computeRedactableAgreementHash,
    computeSectionLeaf,
    isRedactedSection,
    type Agreement,
    type AgreementSection,
    type AnyAgreementSection,
    type RedactableAgreement,
} from "@/lib/core/agreementManifest";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual } from "@/lib/shared/evm";
import { loadAgreement } from "@/lib/core/agreementStore";

type Mode = "agreement" | "section" | "search";

export function HashVerifier() {
    const [mode, setMode] = useState<Mode>("agreement");

    return (
        <div className="space-y-6" data-testid="verify-page">
            <header className="space-y-2">
                <p className="text-xs font-semibold text-neutral-500">
                    Verification
                </p>
                <h2 className="text-xl font-bold text-black">Audit-bundle hash verifier</h2>
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
    const match = expected.length > 0 && hexEqual(computed, expected);
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
            const parsed = JSON.parse(json) as Agreement | RedactableAgreement;
            if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) {
                return { kind: "error" as const, message: "Parsed JSON is not an Agreement (missing sections array)." };
            }
            // Validate each section: must be either cleartext ({ schema, data })
            // or redacted ({ schema, leaf, redacted: true }). Mixing is allowed.
            for (const s of parsed.sections as AnyAgreementSection[]) {
                if (!s || typeof s !== "object" || typeof s.schema !== "string") {
                    return { kind: "error" as const, message: "Each section must have a string `schema` field." };
                }
                if (isRedactedSection(s)) {
                    if (typeof s.leaf !== "string" || !s.leaf.startsWith("0x")) {
                        return { kind: "error" as const, message: `Redacted section "${s.schema}" missing valid 0x-prefixed leaf.` };
                    }
                } else {
                    if (typeof (s as AgreementSection).data !== "object") {
                        return {
                            kind: "error" as const,
                            message: `Section "${s.schema}" missing data field (or use { leaf, redacted: true } for redacted form).`,
                        };
                    }
                }
            }
            const hasRedacted = (parsed.sections as AnyAgreementSection[]).some(isRedactedSection);
            const hash = hasRedacted
                ? computeRedactableAgreementHash(parsed as RedactableAgreement)
                : computeAgreementHash(parsed as Agreement);
            const redactedSchemas = (parsed.sections as AnyAgreementSection[])
                .filter(isRedactedSection)
                .map((s) => s.schema);
            return { kind: "ok" as const, hash, redactedSchemas };
        } catch (e) {
            return { kind: "error" as const, message: extractErrorMessage(e, "JSON parse failed.") };
        }
    }, [json]);

    return (
        <div className="space-y-4" data-testid="verify-agreement-mode">
            <p className="text-xs text-neutral-600">
                Paste an `Agreement` JSON (the off-chain document referenced by `agreementHash`).
                The recomputed merkle root is shown below — compare to the on-chain
                `OrderCommitted.agreementHash` event field. Redacted forms are
                accepted: any section can be{" "}
                <code className="font-mono">{"{ schema, leaf, redacted: true }"}</code>{" "}
                instead of <code className="font-mono">{"{ schema, data }"}</code>, and the
                merkle root is the same value either way.
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
                <>
                    <HashResult computed={result.hash} expected={expected.trim()} label="Recomputed agreement merkle root" />
                    {result.redactedSchemas.length > 0 && (
                        <div
                            className="rounded border border-amber-200 bg-amber-50 p-4 space-y-2 text-xs text-amber-900"
                            data-testid="verify-agreement-redacted-notice"
                        >
                            <p className="font-semibold uppercase tracking-wider text-[11px]">
                                {result.redactedSchemas.length} section{result.redactedSchemas.length > 1 ? "s" : ""} sealed
                            </p>
                            <p>
                                The merkle root above is computed using the stored leaf
                                hashes for redacted sections. To verify a revealed
                                cleartext section, switch to <strong>Mode B</strong>,
                                paste the section JSON, and use the redacted entry&apos;s
                                <code className="font-mono">leaf</code> as the expected
                                leaf hash.
                            </p>
                            <ul className="list-disc list-inside font-mono text-[11px]">
                                {result.redactedSchemas.map((s) => (
                                    <li key={s}>{s}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
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
            return { kind: "error" as const, message: extractErrorMessage(e, "JSON parse failed.") };
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
            if (hexEqual(order.id, target)) {
                found.push({
                    kind: "orderHash",
                    label: `Order hash for buyer ${order.buyer} ↔ seller ${order.seller}`,
                    location: `OrderCommitted.orderHash on FigaroCore (orderStatus[${order.id}] = ${order.state})`,
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
                    label: `Agreement merkle root (order ${order.id})`,
                    location: `OrderCommitted.agreementHash event field`,
                });
            }
            // Walk each order's locally-cached agreement and see if any section leaf matches.
            const agreement = loadAgreement(order.agreementHash);
            if (agreement) {
                for (const section of agreement.sections) {
                    if (hexEqual(computeSectionLeaf(section), target)) {
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
                    with the hash&apos;s source content, or open the relevant
                    process audit at /audit/[processId] first.
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
