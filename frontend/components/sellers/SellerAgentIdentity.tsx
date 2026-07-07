"use client";

/**
 * SellerAgentIdentity — the READ surface for a seller's declared agent service
 * endpoints, and the consumer of the did:web verification hook.
 *
 * A seller can publish a `did:web` identifier plus MCP / A2A / REST / ENS
 * endpoints (the agents onboarding step). This surfaces them to a browsing party
 * and, for the did:web, RESOLVES the DID Document and checks it binds the
 * seller's on-chain address on the current chain — the "discovery vs trust"
 * split the actor-neutral-coordination architecture calls for: endpoints help a
 * counterparty FIND this seller; the verified binding is what lets an agent
 * TRUST the identifier before bonding.
 *
 * Renders nothing when the seller published no services (resolved-empty =
 * absence). did:web resolution is a live network fetch of the DID host, so the
 * badge reflects reachability: verified / unverified / could-not-resolve.
 */

import { useSellerAgentServices } from "@/lib/seller/useSellerAgentServices";
import { useDidVerification } from "@/lib/agent/useDidWeb";

export function SellerAgentIdentity({ sellerAddress }: { sellerAddress: `0x${string}` | undefined }) {
    const { services } = useSellerAgentServices(sellerAddress);
    const did = services?.did;
    const { verified, isLoading: verifying, error } = useDidVerification(did, sellerAddress);

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
                    {verifying ? (
                        <span data-testid="did-status" className="text-xs text-neutral-500">
                            checking…
                        </span>
                    ) : verified ? (
                        <span
                            data-testid="did-status"
                            data-verified="true"
                            className="text-xs font-semibold text-green-700"
                        >
                            ✓ verified · binds this wallet
                        </span>
                    ) : (
                        <span
                            data-testid="did-status"
                            data-verified="false"
                            className="text-xs font-semibold text-amber-700"
                            title={error ?? undefined}
                        >
                            {error ? "unverified · could not resolve" : "unverified · does not bind this wallet"}
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
