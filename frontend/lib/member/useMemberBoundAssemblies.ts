/**
 * useMemberBoundAssemblies — resolves a member's on-chain bound assemblies
 * into the buyer-facing choice set at checkout.
 *
 * Member-domain composition: reads the member's profile (MembersRegistry →
 * IPFS), intersects the profile's `assemblyBindings[].assemblyHash` with the
 * published assembly events, and reads each matched assembly hydrated — the
 * assembly and every agreement's registered agreement, each verified. The
 * on-chain reads come from `@/lib/protocol/useAssemblyRegistry` (a legal
 * downward arrow); the member-profile parsing stays intra-seller.
 */

import { useEffect, useState } from "react";
import type { HydratedAssembly } from "@figaro-protocol/sdk";
import { useMemberProfile } from "@/lib/member/useMembersRegistry";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import type { CoSellerBinding } from "@/lib/member/memberProfileMetadata";
import { assemblyHashOf } from "@figaro-protocol/sdk";
import { bindsAssembly, findListingByAddress } from "@/lib/member/memberListing";
import {
    useAllPublishedAssemblies,
    fetchHydratedAssembly,
} from "@/lib/protocol/useAssemblyRegistry";
import { hexEqual } from "@/lib/shared/evm";
import { PENDING, present, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";

/** A member's on-chain bound assembly, hydrated. */
export interface BoundAssembly {
    /** Derived from the assembly hash (`deriveAssemblySlug`) — display only. */
    slug: string;
    /** Display name from the assembly; falls back to the slug. */
    name: string;
    /** The assembly verified against its assembly hash, beside every
     *  agreement's registered agreement verified against its key. */
    hydratedAssembly: HydratedAssembly;
    /** The member's designated co-seller wallets for this assembly,
     *  keyed by sub-order process clause (the runtime ladder clause the
     *  sub-order carries). Sourced from the member profile's
     *  AssemblyBindingRecord — checkout reads it to fill a delegated
     *  order's seller. */
    coSellerBindings: CoSellerBinding[];
}

/**
 * Resolves a member's on-chain bound assemblies into the buyer-facing
 * choice set — the buyer picks one assembly at checkout. Reads the member's
 * profile (MembersRegistry → IPFS), intersects the profile's
 * `assemblyBindings[].assemblyHash` with the published assembly events, and
 * reads each matched assembly hydrated.
 *
 * A `NetworkRead`: `present([])` when the chain and the profile say the
 * member binds nothing published; `absent` when a read failed (the registry,
 * the assembly scan, the profile document) — never an empty choice set.
 */
export function useMemberBoundAssemblies(
    sellerAddress: `0x${string}` | undefined,
): NetworkRead<BoundAssembly[]> {
    const { read: registration } = useMemberProfile(sellerAddress);
    const { read: published } = useAllPublishedAssemblies();
    const [result, setResult] = useState<NetworkRead<BoundAssembly[]>>(PENDING);

    useEffect(() => {
        if (!sellerAddress) {
            setResult(PENDING);
            return;
        }
        if (registration.status !== "present") {
            setResult(registration);
            return;
        }
        if (published.status !== "present") {
            setResult(published);
            return;
        }
        if (!registration.value.registered) {
            setResult(present([]));
            return;
        }
        const publishedEvents = published.value;
        const metadataURI = registration.value.metadataURI;

        let canceled = false;

        void readNetwork("useMemberBoundAssemblies", async (): Promise<BoundAssembly[]> => {
            // The ONE cached profile read (`fetchMemberProfile`): IPFS-only
            // (an http(s) metadataURI reads as absent), size-capped and
            // parsed. A profile that fails to read or parse is absent.
            const profile = await fetchMemberProfile(metadataURI);
            if (!profile) throw new Error("member profile unreadable");
            if (!profile.assemblyBindings || profile.assemblyBindings.length === 0) return [];

            const boundHashes = new Set(profile.assemblyBindings.map((b) => b.assemblyHash.toLowerCase()));
            const matchedEvents = publishedEvents.filter((e) => boundHashes.has(e.assemblyHash.toLowerCase()));
            if (matchedEvents.length === 0) return [];

            const hydratedAssemblies = await Promise.all(
                matchedEvents.map((e) => fetchHydratedAssembly(e.contentURI, e.assemblyHash)),
            );

            // matchedEvents and hydratedAssemblies are index-aligned (Promise.all
            // over a .map preserves order). Pair them into BoundAssembly,
            // dropping any assembly whose assembly or agreements are absent.
            const assemblies: BoundAssembly[] = [];
            hydratedAssemblies.forEach((m, i) => {
                if (!m) return;
                const { slug, assemblyHash } = matchedEvents[i];
                const binding = (profile.assemblyBindings ?? []).find(
                    (b) => hexEqual(b.assemblyHash, assemblyHash),
                );
                assemblies.push({
                    slug,
                    name: slug,
                    hydratedAssembly: m,
                    coSellerBindings: binding?.coSellerBindings ?? [],
                });
            });
            return assemblies;
        }).then((next) => {
            if (!canceled) setResult(next);
        });

        return () => {
            canceled = true;
        };
    }, [sellerAddress, registration, published]);

    return result;
}

/**
 * The bound assembly with each designated co-seller kept only when its
 * OWN profile binds the assembly too: every seller in a process must have
 * bound the order's assembly, so a designated wallet that has not is never
 * offered — it would refuse the sub-order. `members` is the discovered member
 * set (`useRegisteredCatalogs`); a designated wallet outside it has no profile
 * to read a binding from. A designation left with no wallet is dropped, and
 * the sub-order falls to the buyer's checkout choice.
 */
export function withBoundCoSellers(
    bound: BoundAssembly,
    members: readonly { address: string; assemblyBindings?: readonly { assemblyHash: string }[] }[],
): BoundAssembly {
    const assemblyHash = assemblyHashOf(bound.hydratedAssembly.assembly);
    const coSellerBindings = bound.coSellerBindings
        .map((cb) => ({
            ...cb,
            addresses: cb.addresses.filter((a) => {
                const member = findListingByAddress(members, a);
                return !!member && bindsAssembly(member, assemblyHash);
            }),
        }))
        .filter((cb) => cb.addresses.length > 0);
    return { ...bound, coSellerBindings };
}
