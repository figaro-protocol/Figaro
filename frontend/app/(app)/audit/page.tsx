import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";

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
 * the current process), use `/audit/view?process=<processId>`.
 *
 * Server component — the top-level page doesn't use hooks itself; the
 * `<HashVerifier />` child carries its own `"use client"`.
 */

import Link from "next/link";
import { HashVerifier } from "./_components/HashVerifier";
import { ProcessAuditOpen } from "./_components/ProcessAuditOpen";

export const metadata: Metadata = withOg({
    title: "Audit — Figaro Protocol",
    description: "Verify a hash from an audit bundle against chain state.",
});

export default function AuditPage() {
    return (
        <div className="container mx-auto px-6 py-10 max-w-3xl space-y-8" data-testid="audit-generic-page">
            <header className="space-y-2">
                <h1 className="text-heading-h2 text-ink-heading">
                    Hash verifier
                </h1>
                <p className="text-sm text-ink-body max-w-2xl">
                    Paste content or a hash from an audit bundle to verify against
                    chain. For process-bound audit &mdash; the timeline, financials,
                    clause evidence, and the audit-bundle PDF &mdash; paste a process ID
                    below and open its full record. No wallet, no account: anyone
                    holding a process ID can read any deal&apos;s record.
                </p>
                <p className="text-sm text-ink-muted max-w-2xl">
                    That record opens at <code>/audit/view?process=&lt;processId&gt;</code> &mdash; the
                    id is the whole handle, so the URL is shareable as it stands; a{" "}
                    <Link href="/glossary#process" className="underline hover:text-ink-heading">process</Link>{" "}
                    is one buyer&apos;s whole chain of orders, settling together or not at all.
                </p>
            </header>

            <ProcessAuditOpen />

            <HashVerifier />
        </div>
    );
}
