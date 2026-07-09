/**
 * profileErasure — best-effort unpin of profile-authored IPFS artifacts.
 *
 * The erasure half of the seller's publish story (author pins → author pays
 * → author erases): when a profile is superseded, the prior document — and
 * any authored artifact the successor no longer references (catalogue,
 * branding assets) — is unpinned from the author's node so it stops being
 * served and becomes garbage-collectable. On withdraw nothing survives, so
 * everything the profile referenced is unpinned.
 *
 * Best-effort by design: a confirmed on-chain supersede/withdraw must never
 * fail on a node hiccup — failures are logged and swallowed; a re-run of the
 * same erasure is idempotent (unpinning an absent pin is absence).
 */
import { extractIpfsCid, type IpfsService } from "@/lib/shared/ipfsService";
import type { SellerProfileMetadata } from "@/lib/seller/sellerProfileMetadata";

/** The URI-valued fields a profile document can reference on IPFS. */
function referencedUris(profile: SellerProfileMetadata | null | undefined): string[] {
    if (!profile) return [];
    return [
        profile.catalogueURI,
        profile.branding?.logoURI,
        profile.assets?.imageBaseURI,
    ].filter((u): u is string => Boolean(u));
}

export async function unpinSupersededProfileArtifacts(params: {
    ipfs: Pick<IpfsService, "unpin">;
    /** The registry's metadataURI being superseded (or cleared by withdraw). */
    priorProfileUri: string | null | undefined;
    /** The document that URI pointed at — its references are erasure candidates. */
    priorProfile: SellerProfileMetadata | null | undefined;
    /** The successor document; pass null for withdraw — nothing survives. */
    nextProfile: SellerProfileMetadata | null;
}): Promise<void> {
    const surviving = new Set(
        referencedUris(params.nextProfile)
            .map(extractIpfsCid)
            .filter((c): c is string => Boolean(c)),
    );

    const candidates = [params.priorProfileUri ?? "", ...referencedUris(params.priorProfile)]
        .map(extractIpfsCid)
        .filter((c): c is string => Boolean(c))
        .filter((cid) => !surviving.has(cid));

    for (const cid of new Set(candidates)) {
        try {
            await params.ipfs.unpin(cid);
        } catch (err) {
            console.warn(`[profileErasure] unpin ${cid} failed (content stays pinned):`, err);
        }
    }
}
