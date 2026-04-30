"use client";

import Link from "next/link";
import { ContentImage } from "@/components/shared/ContentImage";
import {
    type Listing,
    listingClickThroughHref,
} from "@/lib/shared/operatorListing";

const FULFILLMENT_LABELS: Record<string, string> = {
    "consume-onsite": "On-site",
    "pickup": "Pickup",
    "delivery": "Delivery",
    "deliver:buyer-assigned": "Delivery (buyer-arranged)",
    "deliver:seller-assigned": "Delivery (seller-arranged)",
    "deliver:dutch-auction": "Delivery (auction)",
};

const ASSEMBLY_LABELS: Record<string, string> = {
    "local-commerce": "Local Commerce",
    "figaro-procurement": "Procurement",
    "figaro-disclosure-review": "Disclosure Review",
    "figaro-equipment-rental": "Equipment Rental",
    "figaro-freelance": "Freelance",
};

function assemblyLabel(slug: string): string {
    return ASSEMBLY_LABELS[slug] ?? slug;
}

function fulfilmentLabel(mode: string): string {
    return FULFILLMENT_LABELS[mode] ?? mode;
}

function distinctAssemblySlugs(listing: Listing): string[] {
    return Array.from(new Set(listing.bindings.map((b) => b.assemblySlug)));
}

function distinctRoles(listing: Listing): string[] {
    return Array.from(new Set(listing.bindings.map((b) => b.roleKind)));
}

export function OperatorCard({ listing }: { listing: Listing }) {
    const href = listingClickThroughHref(listing);
    const assemblies = distinctAssemblySlugs(listing);
    const roles = distinctRoles(listing);

    return (
        <Link
            href={href}
            className="group block rounded-lg border border-gray-200 bg-white p-4 hover:border-black hover:shadow-sm transition-all"
            data-testid="operator-card"
            data-operator-address={listing.address}
        >
            <div className="flex items-start gap-3 mb-3">
                {listing.logoURI ? (
                    <ContentImage
                        src={listing.logoURI}
                        alt={`${listing.name} logo`}
                        className="w-10 h-10 rounded object-cover shrink-0"
                    />
                ) : (
                    <div
                        className="w-10 h-10 rounded shrink-0 flex items-center justify-center text-xs font-semibold text-white"
                        style={{ backgroundColor: listing.accentColor ?? "#6b7280" }}
                    >
                        {listing.name.slice(0, 2).toUpperCase()}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-black truncate">{listing.name}</h3>
                    <p className="text-xs text-gray-500 truncate">
                        {roles.length > 0 ? roles.join(" · ") : "Unbound operator"}
                    </p>
                </div>
            </div>

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

            <div className="flex flex-wrap gap-1.5 mb-3">
                {assemblies.map((slug) => (
                    <span
                        key={slug}
                        className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200"
                    >
                        {assemblyLabel(slug)}
                    </span>
                ))}
                {assemblies.length === 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                        Kernel-direct
                    </span>
                )}
            </div>

            {listing.fulfillmentModes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {listing.fulfillmentModes.map((mode) => (
                        <span
                            key={mode}
                            className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
                        >
                            {fulfilmentLabel(mode)}
                        </span>
                    ))}
                </div>
            )}

            {listing.acceptedTokens.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-100">
                    {listing.acceptedTokens.map((t) => (
                        <span
                            key={t.address}
                            className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200 font-mono"
                        >
                            {t.symbol}
                        </span>
                    ))}
                </div>
            )}
        </Link>
    );
}
