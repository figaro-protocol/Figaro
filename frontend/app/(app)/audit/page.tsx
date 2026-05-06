import type { Metadata } from "next";

/**
 * /audit — generic hash-verification surface (no processId).
 *
 * The auditor case: someone with a hash from an audit-bundle PDF but no
 * specific process id wants to chase the hash to its on-chain source. The
 * `<HashVerifier>` component's search mode walks every order + agreement
 * the connected wallet can see; the agreement and section modes are
 * standalone (paste the JSON, get the hash).
 *
 * For process-bound audit (financials + audit bundle + verify scoped to
 * the current process), use `/audit/[processId]`.
 *
 * Server component — the top-level page doesn't use hooks itself; the
 * `<HashVerifier />` child carries its own `"use client"`.
 *
 * The legacy `/verify` route redirects here.
 */

import { HashVerifier } from "@/components/core/audit/HashVerifier";

export const metadata: Metadata = {
    title: "Audit — Figaro Protocol",
    description: "Verify a hash from an audit bundle against chain state.",
};

export default function AuditPage() {
    return (
        <div className="container mx-auto px-6 py-10 max-w-3xl space-y-8" data-testid="audit-generic-page">
            <header className="space-y-2">
                <p className="text-eyebrow uppercase text-ink-muted">
                    Audit
                </p>
                <h1 className="text-heading-h2 text-ink-heading">
                    Hash verifier
                </h1>
                <p className="text-sm text-ink-body max-w-2xl">
                    Paste content or a hash from an audit bundle to verify against
                    chain. For process-bound audit (financials, audit-bundle PDF,
                    and verifier scoped to the process), open <code>/audit/[processId]</code>{" "}
                    directly.
                </p>
            </header>

            <HashVerifier />
        </div>
    );
}
