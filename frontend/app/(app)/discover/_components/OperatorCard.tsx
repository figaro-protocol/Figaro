"use client";

import Link from "next/link";
import { ContentImage } from "@/components/shared/ContentImage";
import {
    assemblyLabel,
    fulfilmentLabel,
} from "@/lib/shared/assemblyLabels";
import {
    type Listing,
    listingClickThroughHref,
} from "@/lib/shared/operatorListing";
import { useOperatorTrackRecord } from "@/lib/mechanisms/useOperatorTrackRecord";

function distinctAssemblySlugs(listing: Listing): string[] {
    return Array.from(new Set(listing.bindings.map((b) => b.assemblySlug)));
}

function InitialsAvatar({ listing }: { listing: Listing }) {
    return (
        <div
            className="w-10 h-10 rounded shrink-0 flex items-center justify-center text-xs font-semibold text-white"
            style={{ backgroundColor: listing.accentColor ?? "#6b7280" }}
        >
            {listing.name.slice(0, 2).toUpperCase()}
        </div>
    );
}

interface OperatorCardProps {
    listing: Listing;
    /**
     * Called when the user clicks an assembly pill on the card. Lifts
     * filter state to the parent `OperatorDiscovery`. If omitted, pills
     * render as non-interactive labels.
     */
    onAssemblyClick?: (slug: string) => void;
    /**
     * Called when the user clicks a fulfilment pill on the card.
     */
    onFulfilmentClick?: (mode: string) => void;
}

export function OperatorCard({
    listing,
    onAssemblyClick,
    onFulfilmentClick,
}: OperatorCardProps) {
    const href = listingClickThroughHref(listing);
    const assemblies = distinctAssemblySlugs(listing);
    const { trackRecord } = useOperatorTrackRecord(listing.address);

    return (
        <article
            className="relative rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
            data-testid="operator-card"
            data-operator-address={listing.address}
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
                        fallback={<InitialsAvatar listing={listing} />}
                    />
                ) : (
                    <InitialsAvatar listing={listing} />
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-black truncate group-hover:underline">
                        {listing.name}
                    </h3>
                </div>
            </Link>

            {/* Description / specialty / location — informational, not interactive. */}
            {listing.description && (
                <p className="text-sm text-gray-700 leading-snug mb-3 line-clamp-2">
                    {listing.description}
                </p>
            )}

            {listing.specialty && (
                <p className="text-xs text-gray-600 mb-2">
                    <span className="font-semibold">Specialty:</span> {listing.specialty}
                </p>
            )}

            {(listing.geohash || listing.addressText) && (
                <p className="text-xs text-gray-500 mb-3 truncate">
                    {listing.addressText ?? listing.geohash}
                    {listing.addressText && listing.geohash ? (
                        <span className="font-mono text-gray-400 ml-2">({listing.geohash})</span>
                    ) : null}
                </p>
            )}

            {/* Track record — public-graph-derived. Rendered only once the
                operator has completed a process; the absence of the line is
                itself the signal, matching the detail page's honest empty
                state. The full breakdown lives on /m/[operator]. */}
            {trackRecord && trackRecord.completedProcesses > 0 && (
                <p className="text-xs text-gray-600 mb-3" data-testid="card-track-record">
                    <span className="font-semibold text-black tabular-nums">
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
                            className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 hover:border-black hover:bg-gray-200 transition-colors cursor-pointer"
                            aria-label={`Filter by ${assemblyLabel(slug)}`}
                        >
                            {assemblyLabel(slug)}
                        </button>
                    ) : (
                        <span
                            key={slug}
                            className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200"
                        >
                            {assemblyLabel(slug)}
                        </span>
                    ),
                )}
                {assemblies.length === 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                        Kernel-direct
                    </span>
                )}
            </div>

            {/* Fulfilment pills — clickable filter triggers. */}
            {listing.fulfillmentModes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {listing.fulfillmentModes.map((mode) =>
                        onFulfilmentClick ? (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => onFulfilmentClick(mode)}
                                className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-500 hover:bg-blue-100 transition-colors cursor-pointer"
                                aria-label={`Filter by ${fulfilmentLabel(mode)}`}
                            >
                                {fulfilmentLabel(mode)}
                            </button>
                        ) : (
                            <span
                                key={mode}
                                className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
                            >
                                {fulfilmentLabel(mode)}
                            </span>
                        ),
                    )}
                </div>
            )}

            {/* Accepted tokens — plain text, not pills. Descriptive, not filterable. */}
            {listing.acceptedTokens.length > 0 && (
                <p className="pt-2 border-t border-gray-100 text-xs text-gray-500">
                    Accepts {listing.acceptedTokens.map((t) => t.symbol).join(", ")}
                </p>
            )}
        </article>
    );
}
