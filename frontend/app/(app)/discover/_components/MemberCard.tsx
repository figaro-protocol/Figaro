"use client";

import Link from "next/link";
import { ContentImage } from "@/components/shared/ContentImage";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import {
    type Listing,
    listingClickThroughHref,
} from "@/lib/member/memberListing";
import { useMemberTrackRecord } from "@/lib/member/useMemberTrackRecord";

function distinctAssemblySlugs(listing: Listing): string[] {
    return Array.from(new Set(listing.bindings.map((b) => b.assemblySlug)));
}

interface MemberCardProps {
    listing: Listing;
    /**
     * Called when the user clicks an assembly pill on the card. Lifts
     * filter state to the parent `MemberDiscovery`. If omitted, pills
     * render as non-interactive labels.
     */
    onAssemblyClick?: (slug: string) => void;
}

export function MemberCard({
    listing,
    onAssemblyClick,
}: MemberCardProps) {
    const href = listingClickThroughHref(listing);
    const assemblies = distinctAssemblySlugs(listing);
    const { trackRecord } = useMemberTrackRecord(listing.address);

    return (
        <article
            className="relative rounded-lg border border-default bg-paper p-4 transition-shadow hover:shadow-sm"
            data-testid="member-card"
            data-seller-address={listing.address}
        >
            {/* Title block — the only navigation target on the card.
             *  The prior "Example" badge surfaced fixture-provenance listings,
             *  which are no longer blended into discovery. */}
            <Link
                href={href}
                className="flex items-start gap-3 mb-3 group"
            >
                {listing.logoURI ? (
                    <ContentImage
                        src={listing.logoURI}
                        alt={`${listing.name} logo`}
                        className="w-10 h-10 rounded object-cover shrink-0"
                        fallback={<InitialsAvatar name={listing.name} className="shrink-0" />}
                    />
                ) : (
                    <InitialsAvatar name={listing.name} className="shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-ink-primary truncate group-hover:underline">
                        {listing.name}
                    </h3>
                </div>
            </Link>

            {/* Description / specialty / location — informational, not interactive. */}
            {listing.description && (
                <p className="text-sm text-ink-body leading-snug mb-3 line-clamp-2">
                    {listing.description}
                </p>
            )}

            {listing.specialty && (
                <p className="text-xs text-ink-body mb-2">
                    <span className="font-semibold">Specialty:</span> {listing.specialty}
                </p>
            )}

            {(listing.geohash || listing.addressText) && (
                <p className="text-xs text-ink-muted mb-3 truncate">
                    {listing.addressText ?? listing.geohash}
                    {listing.addressText && listing.geohash ? (
                        <span className="font-mono text-ink-faint ml-2">({listing.geohash})</span>
                    ) : null}
                </p>
            )}

            {/* Track record — public-graph-derived. Rendered only once the
                seller has completed a process; the absence of the line is
                itself the signal, matching the detail page's honest empty
                state. The full breakdown lives on /s/view?seller=<address>. */}
            {trackRecord && trackRecord.completedProcesses > 0 && (
                <p className="text-xs text-ink-body mb-3" data-testid="card-track-record">
                    <span className="font-semibold text-ink-primary tabular-nums">
                        {trackRecord.completedProcesses}
                    </span>
                    {" processes completed on the public graph"}
                </p>
            )}

            {/* Assembly pills — clickable filter triggers when callback supplied. */}
            <div className="flex flex-wrap gap-1.5 mb-3">
                {assemblies.map((slug) =>
                    onAssemblyClick ? (
                        <button
                            key={slug}
                            type="button"
                            onClick={() => onAssemblyClick(slug)}
                            className="text-xs px-2 py-0.5 rounded-full bg-subtle text-ink-body border border-default hover:border-default-strong hover:bg-subtle-hover transition-colors cursor-pointer"
                            aria-label={`Filter by ${slug}`}
                        >
                            {slug}
                        </button>
                    ) : (
                        <span
                            key={slug}
                            className="text-xs px-2 py-0.5 rounded-full bg-subtle text-ink-body border border-default"
                        >
                            {slug}
                        </span>
                    ),
                )}
                {/* No bindings → no pills. NO FALLBACKS: the surface renders
                    what the network says, never a synthesized stand-in. */}
            </div>

            {/* Accepted tokens — plain text, not pills. Descriptive, not filterable. */}
            {listing.acceptedTokens.length > 0 && (
                <p className="pt-2 border-t border-default text-xs text-ink-muted">
                    Accepts {listing.acceptedTokens.map((t) => t.symbol).join(", ")}
                </p>
            )}
        </article>
    );
}
