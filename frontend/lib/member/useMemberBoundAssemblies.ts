/**
 * useMemberBoundAssemblies — resolves a member's on-chain bound assemblies
 * into the buyer-facing choice set at checkout.
 *
 * Member-domain composition: reads the member's profile (MembersRegistry →
 * IPFS), intersects the profile's `assemblyBindings[].compositionHash` with the
 * published assembly events, and reads each matched assembly hydrated — the
 * assembly and every agreement's registered agreement, each verified. The
 * on-chain reads come from `@/lib/protocol/useAssemblyRegistry` (a legal
 * downward arrow); the member-profile parsing stays intra-seller.
 */

import { useEffect, useState } from "react";
import { fetchCappedContent, resolveMemberDocumentUri } from "@/lib/shared/ipfsService";
import { safeJsonParse } from "@/lib/shared/safeJson";
import type { HydratedAssembly } from "@figaro-protocol/sdk";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import {
    tryParseMemberProfileDocument,
    type CounterpartyBinding,
} from "@/lib/member/memberProfileMetadata";
import { assemblyCompositionHash } from "@figaro-protocol/sdk";
import { bindsAssembly, findListingByAddress } from "@/lib/member/memberListing";
import {
    useAllPublishedAssemblies,
    fetchHydratedAssembly,
} from "@/lib/protocol/useAssemblyRegistry";

/** A member's on-chain bound assembly, hydrated. */
export interface BoundAssembly {
    /** Derived from the composition hash (`deriveAssemblySlug`) — display only. */
    slug: string;
    /** Display name from the assembly; falls back to the slug. */
    name: string;
    /** The assembly verified against its composition hash, beside every
     *  agreement's registered agreement verified against its key. */
    hydratedAssembly: HydratedAssembly;
    /** The member's designated counterparty wallets for this assembly,
     *  keyed by sub-order process clause (the runtime ladder clause the
     *  sub-order carries). Sourced from the member profile's
     *  AssemblyBindingRecord — checkout reads it to fill a delegated
     *  order's seller. */
    counterpartyBindings: CounterpartyBinding[];
}

export interface MemberBoundAssemblies {
    /** The member's on-chain bound assemblies, hydrated —
     *  the buyer-facing choice set at checkout. Each bound assembly is
     *  one option the member offers; the buyer picks one. */
    assemblies: BoundAssembly[];
    /** True while either the member-profile or the assembly reads are in flight. */
    isLoading: boolean;
    /** True when at least one of the member's bindings matched a published assembly. */
    hasOnChainBinding: boolean;
}

/**
 * Resolves a member's on-chain bound assemblies into the buyer-facing
 * choice set. Reads the member's profile (MembersRegistry →
 * IPFS), intersects the profile's `assemblyBindings[].compositionHash` with
 * the published assembly events, and reads each matched assembly hydrated.
 *
 * When `hasOnChainBinding` is true, `assemblies` is the authoritative
 * buyer-facing choice set — the buyer picks one assembly at checkout —
 * When false, the caller falls back to the catalog.
 */
export function useMemberBoundAssemblies(
    sellerAddress: `0x${string}` | undefined,
): MemberBoundAssemblies {
    const { data: registryData, isLoading: registryLoading } = useMemberProfile(sellerAddress);
    const { data: publishedEvents, isLoading: eventsLoading } = useAllPublishedAssemblies();
    const [result, setResult] = useState<MemberBoundAssemblies>({
        assemblies: [],
        isLoading: false,
        hasOnChainBinding: false,
    });

    useEffect(() => {
        if (!sellerAddress) {
            setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
            return;
        }
        if (registryLoading || eventsLoading) {
            setResult((r) => ({ ...r, isLoading: true }));
            return;
        }
        if (!registryData || !publishedEvents) {
            setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
            return;
        }

        const [metadataURI] = registryData;
        // IPFS-only: an http(s) metadataURI reads as absent (`uriFetcher`).
        const url = resolveMemberDocumentUri(metadataURI);
        if (!url) {
            setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
            return;
        }

        let canceled = false;
        setResult((r) => ({ ...r, isLoading: true }));

        (async () => {
            try {
                // Size-capped fetch (F4): the member-pinned profile document is
                // external-party-controlled — oversize throws → the catch below.
                const response = await fetchCappedContent(url);
                if (!response.ok) throw new Error("member profile fetch failed");
                // Prototype-pollution-safe parse (finding 7): the profile is an
                // external-party-pinned document; the stripping reviver drops
                // __proto__/constructor keys before any downstream object copy.
                const doc = safeJsonParse(await response.text());
                const profile = tryParseMemberProfileDocument(doc);
                if (canceled) return;
                if (!profile?.assemblyBindings || profile.assemblyBindings.length === 0) {
                    setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
                    return;
                }

                const boundHashes = new Set(profile.assemblyBindings.map((b) => b.compositionHash.toLowerCase()));
                const matchedEvents = publishedEvents.filter((e) => boundHashes.has(e.compositionHash.toLowerCase()));
                if (matchedEvents.length === 0) {
                    setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
                    return;
                }

                const hydratedAssemblies = await Promise.all(
                    matchedEvents.map((e) => fetchHydratedAssembly(e.contentURI, e.compositionHash)),
                );
                if (canceled) return;

                // matchedEvents and hydratedAssemblies are index-aligned (Promise.all
                // over a .map preserves order). Pair them into BoundAssembly,
                // dropping any assembly whose assembly or agreements are absent.
                const assemblies: BoundAssembly[] = [];
                hydratedAssemblies.forEach((m, i) => {
                    if (!m) return;
                    const { slug, compositionHash } = matchedEvents[i];
                    const binding = (profile.assemblyBindings ?? []).find(
                        (b) => b.compositionHash.toLowerCase() === compositionHash.toLowerCase(),
                    );
                    assemblies.push({
                        slug,
                        name: slug,
                        hydratedAssembly: m,
                        counterpartyBindings: binding?.counterpartyBindings ?? [],
                    });
                });

                setResult({
                    assemblies,
                    isLoading: false,
                    hasOnChainBinding: true,
                });
            } catch {
                if (!canceled) {
                    setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
                }
            }
        })();

        return () => {
            canceled = true;
        };
    }, [sellerAddress, registryData, publishedEvents, registryLoading, eventsLoading]);

    return result;
}

/**
 * The bound assembly with each designated counterparty kept only when its
 * OWN profile binds the assembly too: every seller in a process must have
 * bound the order's assembly, so a designated wallet that has not is never
 * offered — it would refuse the sub-order. `members` is the discovered member
 * set (`useRegisteredCatalogs`); a designated wallet outside it has no profile
 * to read a binding from. A designation left with no wallet is dropped, and
 * the sub-order falls to the buyer's checkout choice.
 */
export function withBoundCounterparties(
    bound: BoundAssembly,
    members: readonly { address: string; assemblyBindings?: readonly { compositionHash: string }[] }[],
): BoundAssembly {
    const compositionHash = assemblyCompositionHash(bound.hydratedAssembly.assembly);
    const counterpartyBindings = bound.counterpartyBindings
        .map((cb) => ({
            ...cb,
            addresses: cb.addresses.filter((a) => {
                const member = findListingByAddress(members, a);
                return !!member && bindsAssembly(member, compositionHash);
            }),
        }))
        .filter((cb) => cb.addresses.length > 0);
    return { ...bound, counterpartyBindings };
}
