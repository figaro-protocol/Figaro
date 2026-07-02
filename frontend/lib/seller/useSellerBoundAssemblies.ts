/**
 * useSellerBoundAssemblies — resolves a seller's on-chain bound assemblies
 * into the buyer-facing choice set at checkout.
 *
 * Seller-domain composition: reads the seller's profile (SellerRegistry →
 * IPFS), intersects the profile's `assemblyBindings[].assemblySlug` with the
 * published assembly events, and fetches each matched assemblyTemplate. The
 * on-chain reads come from `@/lib/protocol/useAssemblyRegistry` (a legal
 * downward arrow); the seller-profile parsing stays intra-seller.
 */

import { useEffect, useState } from "react";
import { resolveContentUri } from "@/lib/shared/ipfsService";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import { useSellerProfile } from "@/lib/seller/useSellerRegistry";
import {
    tryParseSellerProfileDocument,
    type CounterpartyBinding,
} from "@/lib/seller/sellerProfileMetadata";
import {
    useAllPublishedAssemblies,
    fetchAssemblyTemplate,
} from "@/lib/protocol/useAssemblyRegistry";
import { extractRootModality } from "@/lib/protocol/assemblyChoices";

/** A seller's on-chain bound assembly, assemblyTemplate resolved. */
export interface BoundAssembly {
    slug: string;
    /** Display name from the assembly template; falls back to the slug. */
    name: string;
    assemblyTemplate: AssemblyTemplate;
    /** The seller's designated counterparty wallets for this assembly,
     *  keyed by sub-order process clause (the runtime ladder clause the
     *  sub-order carries). Sourced from the seller profile's
     *  AssemblyBindingRecord — checkout reads it to fill a delegated
     *  order's seller. */
    counterpartyBindings: CounterpartyBinding[];
}

export interface SellerBoundAssemblies {
    /** The seller's on-chain bound assemblies, assemblyTemplates resolved —
     *  the buyer-facing choice set at checkout. Each bound assembly is
     *  one option the seller offers; the buyer picks one. */
    assemblies: BoundAssembly[];
    /** Union of root-order modalities across the bound
     *  assemblies. Derived from `assemblies` — kept for callers that
     *  only need the flat modality set. */
    modalities: string[];
    /** True while either the seller-profile or the assemblyTemplate fetches are in flight. */
    isLoading: boolean;
    /** True when at least one of the seller's bindings matched a published assembly. */
    hasOnChainBinding: boolean;
}

/**
 * Resolves a seller's on-chain bound assemblies into the buyer-facing
 * choice set. Reads the seller's profile (SellerRegistry →
 * IPFS), intersects the profile's `assemblyBindings[].assemblySlug` with
 * the published assembly events, and fetches each matched assemblyTemplate.
 *
 * When `hasOnChainBinding` is true, `assemblies` is the authoritative
 * buyer-facing choice set — the buyer picks one assembly at checkout —
 * and `modalities` is the flat union of their root-order
 * modalities. When false, the caller falls back to the catalogue.
 */
export function useSellerBoundAssemblies(
    sellerAddress: `0x${string}` | undefined,
): SellerBoundAssemblies {
    const { data: registryData, isLoading: registryLoading } = useSellerProfile(sellerAddress);
    const { data: publishedEvents, isLoading: eventsLoading } = useAllPublishedAssemblies();
    const [result, setResult] = useState<SellerBoundAssemblies>({
        assemblies: [],
        modalities: [],
        isLoading: false,
        hasOnChainBinding: false,
    });

    useEffect(() => {
        if (!sellerAddress) {
            setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
            return;
        }
        if (registryLoading || eventsLoading) {
            setResult((r) => ({ ...r, isLoading: true }));
            return;
        }
        if (!registryData || !publishedEvents) {
            setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
            return;
        }

        const [metadataURI] = registryData;
        const url = resolveContentUri(metadataURI);
        if (!url) {
            setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
            return;
        }

        let cancelled = false;
        setResult((r) => ({ ...r, isLoading: true }));

        (async () => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error("seller profile fetch failed");
                const doc = await response.json();
                const profile = tryParseSellerProfileDocument(doc);
                if (cancelled) return;
                if (!profile?.assemblyBindings || profile.assemblyBindings.length === 0) {
                    setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
                    return;
                }

                const sellerSlugs = new Set(profile.assemblyBindings.map((b) => b.assemblySlug));
                const matchedEvents = publishedEvents.filter((e) => sellerSlugs.has(e.slug));
                if (matchedEvents.length === 0) {
                    setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
                    return;
                }

                const assemblyTemplates = await Promise.all(
                    matchedEvents.map((e) => fetchAssemblyTemplate(e.metadataURI)),
                );
                if (cancelled) return;

                // matchedEvents and assemblyTemplates are index-aligned (Promise.all
                // over a .map preserves order). Pair them into BoundAssembly,
                // dropping any assemblyTemplate that failed to fetch.
                const assemblies: BoundAssembly[] = [];
                const modalitySet = new Set<string>();
                assemblyTemplates.forEach((m, i) => {
                    if (!m) return;
                    const slug = matchedEvents[i].slug;
                    const { modality } = extractRootModality(m);
                    const binding = (profile.assemblyBindings ?? []).find(
                        (b) => b.assemblySlug === slug,
                    );
                    assemblies.push({
                        slug,
                        name: slug,
                        assemblyTemplate: m,
                        counterpartyBindings: binding?.counterpartyBindings ?? [],
                    });
                    if (modality) modalitySet.add(modality);
                });

                setResult({
                    assemblies,
                    modalities: Array.from(modalitySet),
                    isLoading: false,
                    hasOnChainBinding: true,
                });
            } catch {
                if (!cancelled) {
                    setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [sellerAddress, registryData, publishedEvents, registryLoading, eventsLoading]);

    return result;
}
