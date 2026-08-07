"use client";

/**
 * BatchUniversePanel — what the batch universe says about this process, and
 * exactly how much of it this reader checked.
 *
 * `/audit`'s other panels read the network directly. This one reads a RELAY,
 * which is transport and not authority, so it never presents relay data as
 * chain truth: every record is re-derived by `lib/audit/batchRelay`
 * (struct → its own order hash and process id, both signatures → the parties
 * named inside that struct under the VERIFIER's domain, payouts → recomputed
 * from the struct, batch → anchored to a `BatchSettled` on chain) and this
 * panel reports the verdict per check.
 *
 * A record that fails any check is shown as FAILED, naming the check and the
 * mismatch. It is never dropped and never softened — a relay publishing
 * something nobody signed must be visible, not invisible.
 */

import type { BatchRelayCheck, VerifiedBatchProcess } from "@/lib/audit/batchRelay";

function CheckList({ checks, orderHash }: { checks: BatchRelayCheck[]; orderHash: string }) {
    if (checks.length === 0) return null;
    return (
        <dl
            className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-0.5 text-xs"
            data-testid={`batch-checks-${orderHash}`}
        >
            {checks.map((check) => (
                <div key={check.id} className="contents">
                    <dt className="text-ink-muted font-mono">{check.id}</dt>
                    <dd data-testid={`batch-check-${check.id}-${orderHash}`}>
                        {check.ok ? (
                            <span className="text-green-700">&#10003; {check.detail}</span>
                        ) : (
                            <span className="text-red-700 font-semibold">
                                &#10007; {check.detail}
                            </span>
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/** Each status is a DIFFERENT fact, and the copy keeps them different. */
function StatusNotice({ batch }: { batch: VerifiedBatchProcess }) {
    if (batch.status === "no-relay") {
        return (
            <p className="text-sm text-ink-body" data-testid="batch-status-no-relay">
                No batch relay is configured, so batch-settled trade cannot be read
                here. This is not a statement that none exists &mdash; the kernel
                publishes direct-path trade as events, but the batch path publishes
                no per-order data on chain, so reading it needs a relay. Settling a
                batch is permissionless, so you can point at any relay, or run your
                own, in <span className="font-mono">/members/edit/endpoints</span>.
            </p>
        );
    }
    if (batch.status === "no-verifier") {
        return (
            <p className="text-sm text-ink-body" data-testid="batch-status-no-verifier">
                No FigaroBatchVerifier is configured on this network, so nothing a
                relay published could be anchored on chain. Unanchorable records are
                not displayed.
            </p>
        );
    }
    if (batch.status === "unreachable") {
        return (
            <p className="text-sm text-red-700" data-testid="batch-status-unreachable">
                The relay at <span className="font-mono break-all">{batch.relayUrl}</span>{" "}
                could not be read: {batch.error}
            </p>
        );
    }
    if (batch.status === "not-in-archive") {
        return (
            <p className="text-sm text-ink-body" data-testid="batch-status-absent">
                The relay at <span className="font-mono break-all">{batch.relayUrl}</span>{" "}
                holds nothing under this process id. That means &ldquo;not in THIS
                relay&rsquo;s archive&rdquo; &mdash; it may have been settled by another
                relay, settled directly against FigaroCore, or aged out of this
                relay&rsquo;s retention window. It never means the trade did not happen.
                {batch.window && (
                    <>
                        {" "}This relay retains batches{" "}
                        {batch.window.first_batch ?? "—"}&ndash;{batch.window.last_batch ?? "—"}{" "}
                        ({batch.window.retained_batches} of {batch.window.max_batches}).
                    </>
                )}
            </p>
        );
    }
    return null;
}

export function BatchUniversePanel({ batch }: { batch: VerifiedBatchProcess | null }) {
    if (!batch) return null;

    const failed = batch.orders.filter((o) => o.verdict === "failed");
    const unretained = batch.orders.filter((o) => o.verdict === "unretained");
    const verified = batch.orders.filter((o) => o.verdict === "verified");

    return (
        <section className="space-y-5" data-testid="batch-universe-panel">
            <div className="space-y-2">
                <h2 className="text-heading-h3 text-ink-heading">Batch-settled trade</h2>
                <p className="text-sm text-ink-body max-w-2xl">
                    A batch-settled order emits no kernel event &mdash; its struct
                    exists only under the verifier&rsquo;s proven state root &mdash; so
                    reading it means reading a relay. Nothing below is taken on the
                    relay&rsquo;s word: each record&rsquo;s struct must re-derive its own
                    order hash, both signatures must recover to the parties named
                    inside that struct, the payouts must recompute from it, and the
                    batch&rsquo;s state root must be anchored in a{" "}
                    <code>BatchSettled</code> on chain. A relay can omit or delay; it
                    cannot forge.
                </p>
            </div>

            <StatusNotice batch={batch} />

            {batch.status === "found" && (
                <>
                    <p className="text-xs text-ink-muted" data-testid="batch-relay-source">
                        Read from <span className="font-mono break-all">{batch.relayUrl}</span>
                        {" — "}
                        {verified.length} verified, {failed.length} failed,{" "}
                        {unretained.length} unretained.
                    </p>

                    {batch.resolution && (
                        <div
                            className="space-y-1 border border-default rounded-section p-4"
                            data-testid="batch-process-resolution"
                        >
                            <p className="text-sm text-ink-heading font-semibold">
                                Process resolution
                            </p>
                            <p className="text-xs text-ink-muted font-mono break-all">
                                buyer {batch.resolution.buyer} · {batch.resolution.orderCount} orders
                            </p>
                            <p className="text-xs" data-testid="batch-resolve-signature">
                                {batch.resolution.signature.ok ? (
                                    <span className="text-green-700">
                                        &#10003; {batch.resolution.signature.detail}
                                    </span>
                                ) : (
                                    <span className="text-red-700 font-semibold">
                                        &#10007; {batch.resolution.signature.detail}
                                    </span>
                                )}
                            </p>
                        </div>
                    )}

                    {batch.orders.length === 0 ? (
                        <p className="text-sm text-ink-muted" data-testid="batch-no-orders">
                            The relay holds this process but published no orders under it.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {batch.orders.map((o) => (
                                <div
                                    key={o.orderHash}
                                    className={`space-y-2 border rounded-section p-4 ${o.verdict === "failed"
                                        ? "border-red-400"
                                        : "border-default"
                                        }`}
                                    data-testid={`batch-order-${o.orderHash}`}
                                >
                                    <div className="flex flex-wrap items-baseline gap-x-3">
                                        <p className="text-xs font-mono text-ink-muted break-all">
                                            order {o.orderHash}
                                        </p>
                                        <span
                                            className={`text-xs font-semibold ${o.verdict === "verified"
                                                ? "text-green-700"
                                                : o.verdict === "failed"
                                                    ? "text-red-700"
                                                    : "text-ink-muted"
                                                }`}
                                            data-testid={`batch-verdict-${o.orderHash}`}
                                        >
                                            {o.verdict === "verified" && "Verified against the signed struct and the chain"}
                                            {o.verdict === "failed" && "FAILED verification — not displayed as trade"}
                                            {o.verdict === "unretained" && "Unretained — this relay dropped the committing batch, so there is no struct to check"}
                                        </span>
                                    </div>
                                    <CheckList checks={o.checks} orderHash={o.orderHash} />
                                    {o.batch && (
                                        <p className="text-[11px] text-ink-muted break-all">
                                            state root {o.batch.new_state_root}
                                            {o.batch.settlement_tx
                                                ? <> · settled in {o.batch.settlement_tx}</>
                                                : <> · no settlement transaction (dry run)</>}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
