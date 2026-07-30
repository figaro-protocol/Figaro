"use client";

/**
 * SellerAgentIdentity — the READ surface for a seller's declared agent service
 * endpoints, and the consumer of the did:web consistency-check hook.
 *
 * A seller can publish a `did:web` identifier plus MCP / A2A / REST / ENS
 * endpoints (the agents onboarding step). This surfaces them to a browsing party
 * and, for the did:web, RESOLVES the DID Document and checks whether it names
 * the seller's on-chain address on the current chain — the "discovery vs trust"
 * split the actor-neutral-coordination architecture calls for: endpoints help a
 * counterparty FIND this seller; the consistency check is a discovery signal,
 * NOT proof of control. Anyone can host a did:web document naming any wallet, so
 * the binding is attacker-forgeable and informs — never by itself justifies —
 * trust before bonding.
 *
 * Renders nothing when the seller published no services (resolved-empty =
 * absence). did:web resolution is a live network fetch of the DID host, so the
 * badge reflects reachability: consistent / inconsistent / could-not-resolve.
 */

import { useAgentServices } from "@/lib/seller/useMembersRegistry";
import { useDidConsistency } from "@/lib/agent/useDidWeb";

export function SellerAgentIdentity({ sellerAddress }: { sellerAddress: `0x${string}` | undefined }) {
    const { data } = useAgentServices(sellerAddress);
    const services = data?.services;
    const did = services?.did;
    const { consistent, isLoading: checking, error } = useDidConsistency(did, sellerAddress);

    const endpoints: Array<[string, string]> = [];
    if (services?.mcp) endpoints.push(["MCP", services.mcp]);
    if (services?.a2a) endpoints.push(["A2A", services.a2a]);
    if (services?.rest) endpoints.push(["REST", services.rest]);
    if (services?.ens) endpoints.push(["ENS", services.ens]);

    // Resolved-empty = absence: a seller with no published agent services shows nothing.
    if (!did && endpoints.length === 0) return null;

    return (
        <div
            data-testid="seller-agent-identity"
            className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-2"
        >
            <p className="text-xs font-semibold text-neutral-500">Agent identity</p>

            {did && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <code className="text-xs text-neutral-800 break-all">{did}</code>
                    {checking ? (
                        <span data-testid="did-status" className="text-xs text-neutral-500">
                            checking…
                        </span>
                    ) : consistent ? (
                        <span
                            data-testid="did-status"
                            data-consistent="true"
                            className="text-xs font-semibold text-green-700"
                            title="This DID document names this wallet. It does not prove the wallet controls the DID — anyone can host a document naming any wallet."
                        >
                            ✓ consistent · DID names this wallet
                        </span>
                    ) : (
                        <span
                            data-testid="did-status"
                            data-consistent="false"
                            className="text-xs font-semibold text-amber-700"
                            title={error ?? undefined}
                        >
                            {error ? "unconfirmed · could not resolve" : "inconsistent · DID does not name this wallet"}
                        </span>
                    )}
                </div>
            )}

            {endpoints.length > 0 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                    {endpoints.map(([label, value]) => (
                        <li key={label}>
                            <span className="font-semibold text-neutral-500">{label}:</span>{" "}
                            <code className="break-all">{value}</code>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
