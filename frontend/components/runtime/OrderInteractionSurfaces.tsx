"use client";

/**
 * OrderInteractionSurfaces — the generic mount point for declared
 * interaction surfaces on an order page.
 *
 * Reads the order's committed agreement (IPFS-hydrated), and for every
 * clause whose spec declares `block.interaction`, mounts the surface this
 * frontend registered for that interface (`interactionSurfaces`). Names no
 * clause and no interface: the DISPATCH KEY is the spec's own declaration —
 * a never-seen clause declaring a known interaction surfaces here with zero
 * code changes; an unknown interaction renders nothing.
 */
import { useProcessAgreements } from "@/hooks/useProcessAgreements";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { getInteractionSurface } from "@/components/runtime/interactionSurfaces";

export function OrderInteractionSurfaces({
    processId,
    orderHash,
    agreementHash,
    buyer,
    seller,
}: {
    processId: string;
    orderHash: string;
    agreementHash: `0x${string}`;
    buyer: `0x${string}`;
    seller: `0x${string}`;
}) {
    const agreements = useProcessAgreements([agreementHash]);
    const agreement = agreements.get(agreementHash);
    if (!agreement) return null;

    const mounts = agreement.sections
        .map((section) => {
            const interfaceId = getClauseSpec(section.clause)?.block?.interaction?.interface;
            const Surface = getInteractionSurface(interfaceId);
            return Surface ? { clauseId: section.clause, Surface } : null;
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
    if (mounts.length === 0) return null;

    return (
        <div className="space-y-3">
            {mounts.map(({ clauseId, Surface }) => (
                <Surface
                    key={clauseId}
                    processId={processId}
                    orderHash={orderHash}
                    clauseId={clauseId}
                    buyer={buyer}
                    seller={seller}
                />
            ))}
        </div>
    );
}
