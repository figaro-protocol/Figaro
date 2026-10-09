/**
 * profileErasure — best-effort unpin of profile-published IPFS artifacts.
 *
 * The erasure half of the member's publish story (wallet pins → wallet pays
 * → wallet erases): when a profile is superseded, the prior document — and
 * any published artifact the successor no longer references (catalog,
 * branding assets) — is unpinned from the member's node so it stops being
 * served and becomes garbage-collectable. On withdraw nothing survives, so
 * everything the profile referenced is unpinned.
 *
 * Every candidate is tried; a refused unpin is never swallowed — once all
 * have been tried, the erasure rejects with every refusal the service
 * answered, and the content it names stays pinned. A re-run of the same
 * erasure is idempotent (unpinning an absent pin is absence).
 */
import { extractIpfsCid, type IpfsService } from "@/lib/shared/ipfsService";
import type { MemberProfileMetadata } from "@/lib/member/memberProfileMetadata";
import { extractErrorMessage } from "@/lib/shared/errors";

/** The URI-valued fields a profile document can reference on IPFS. */
function referencedUris(profile: MemberProfileMetadata | null | undefined): string[] {
    if (!profile) return [];
    return [
        profile.catalogURI,
        profile.branding?.logoURI,
        profile.assets?.imageBaseURI,
    ].filter((u): u is string => Boolean(u));
}

export async function unpinSupersededProfileArtifacts(params: {
    ipfs: Pick<IpfsService, "unpin">;
    /** The registry's metadataURI being superseded (or cleared by withdraw). */
    priorProfileUri: string | null | undefined;
    /** The document that URI pointed at — its references are erasure candidates. */
    priorProfile: MemberProfileMetadata | null | undefined;
    /** The successor document; pass null for withdraw — nothing survives. */
    nextProfile: MemberProfileMetadata | null;
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

    const refusals: string[] = [];
    for (const cid of new Set(candidates)) {
        try {
            await params.ipfs.unpin(cid);
        } catch (err) {
            refusals.push(extractErrorMessage(err, `The unpin of ${cid} was refused.`));
        }
    }
    if (refusals.length > 0) throw new Error(refusals.join(" "));
}
