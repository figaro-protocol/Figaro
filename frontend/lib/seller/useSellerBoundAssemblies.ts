/**
 * useSellerBoundAssemblies — resolves a seller's on-chain bound assemblies
 * into the buyer-facing choice set at checkout.
 *
 * Seller-domain composition: reads the seller's profile (MembersRegistry →
 * IPFS), intersects the profile's `assemblyBindings[].assemblySlug` with the
 * published assembly events, and fetches each matched assemblyTemplate. The
 * on-chain reads come from `@/lib/protocol/useAssemblyRegistry` (a legal
 * downward arrow); the member-profile parsing stays intra-seller.
 */

import { useEffect, useState } from "react";
import { fetchCappedContent, resolveContentUri } from "@/lib/shared/ipfsService";
import { safeJsonParse } from "@/lib/shared/safeJson";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import {
    tryParseMemberProfileDocument,
    type CounterpartyBinding,
} from "@/lib/member/memberProfileMetadata";
import {
    useAllPublishedAssemblies,
    fetchAssemblyTemplate,
} from "@/lib/protocol/useAssemblyRegistry";

/** A seller's on-chain bound assembly, assemblyTemplate resolved. */
export interface BoundAssembly {
    slug: string;
    /** Display name from the assembly template; falls back to the slug. */
    name: string;
    assemblyTemplate: AssemblyTemplate;
    /** The seller's designated counterparty wallets for this assembly,
     *  keyed by sub-order process clause (the runtime ladder clause the
     *  sub-order carries). Sourced from the member profile's
     *  AssemblyBindingRecord — checkout reads it to fill a delegated
     *  order's seller. */
    counterpartyBindings: CounterpartyBinding[];
}

export interface SellerBoundAssemblies {
    /** The seller's on-chain bound assemblies, assemblyTemplates resolved —
     *  the buyer-facing choice set at checkout. Each bound assembly is
     *  one option the seller offers; the buyer picks one. */
    assemblies: BoundAssembly[];
    /** True while either the member-profile or the assemblyTemplate fetches are in flight. */
    isLoading: boolean;
    /** True when at least one of the seller's bindings matched a published assembly. */
    hasOnChainBinding: boolean;
}

/**
 * Resolves a seller's on-chain bound assemblies into the buyer-facing
 * choice set. Reads the seller's profile (MembersRegistry →
 * IPFS), intersects the profile's `assemblyBindings[].assemblySlug` with
 * the published assembly events, and fetches each matched assemblyTemplate.
 *
 * When `hasOnChainBinding` is true, `assemblies` is the authoritative
 * buyer-facing choice set — the buyer picks one assembly at checkout —
 * When false, the caller falls back to the catalogue.
 */
export function useSellerBoundAssemblies(
    sellerAddress: `0x${string}` | undefined,
): SellerBoundAssemblies {
    const { data: registryData, isLoading: registryLoading } = useMemberProfile(sellerAddress);
    const { data: publishedEvents, isLoading: eventsLoading } = useAllPublishedAssemblies();
    const [result, setResult] = useState<SellerBoundAssemblies>({
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
        const url = resolveContentUri(metadataURI);
        if (!url) {
            setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
            return;
        }

        let cancelled = false;
        setResult((r) => ({ ...r, isLoading: true }));

        (async () => {
            try {
                // Size-capped fetch (F4): the seller-pinned profile document is
                // external-party-controlled — oversize throws → the catch below.
                const response = await fetchCappedContent(url);
                if (!response.ok) throw new Error("member profile fetch failed");
                // Prototype-pollution-safe parse (finding 7): the profile is an
                // external-party-pinned document; the stripping reviver drops
                // __proto__/constructor keys before any downstream record copy.
                const doc = safeJsonParse(await response.text());
                const profile = tryParseMemberProfileDocument(doc);
                if (cancelled) return;
                if (!profile?.assemblyBindings || profile.assemblyBindings.length === 0) {
                    setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
                    return;
                }

                const sellerSlugs = new Set(profile.assemblyBindings.map((b) => b.assemblySlug));
                const matchedEvents = publishedEvents.filter((e) => sellerSlugs.has(e.slug));
                if (matchedEvents.length === 0) {
                    setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
                    return;
                }

                const assemblyTemplates = await Promise.all(
                    matchedEvents.map((e) => fetchAssemblyTemplate(e.contentURI, e.compositionHash)),
                );
                if (cancelled) return;

                // matchedEvents and assemblyTemplates are index-aligned (Promise.all
                // over a .map preserves order). Pair them into BoundAssembly,
                // dropping any assemblyTemplate that failed to fetch.
                const assemblies: BoundAssembly[] = [];
                assemblyTemplates.forEach((m, i) => {
                    if (!m) return;
                    const slug = matchedEvents[i].slug;
                    const binding = (profile.assemblyBindings ?? []).find(
                        (b) => b.assemblySlug === slug,
                    );
                    assemblies.push({
                        slug,
                        name: slug,
                        assemblyTemplate: m,
                        counterpartyBindings: binding?.counterpartyBindings ?? [],
                    });
                });

                setResult({
                    assemblies,
                    isLoading: false,
                    hasOnChainBinding: true,
                });
            } catch {
                if (!cancelled) {
                    setResult({ assemblies: [], isLoading: false, hasOnChainBinding: false });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [sellerAddress, registryData, publishedEvents, registryLoading, eventsLoading]);

    return result;
}
