"use client";

import { useMemo, useState } from "react";
import { OperatorCard } from "./OperatorCard";
import { useDeviceLocation } from "@/hooks/core/useDeviceLocation";
import {
    assemblyLabel,
    fulfilmentLabel,
} from "@/lib/shared/assemblyLabels";
import {
    listingMatchesGeohash,
    type Listing,
} from "@/lib/shared/operatorListing";
import { useOperatorListings } from "@/lib/mechanisms/useOperatorListings";

function listingAssemblies(listing: Listing): string[] {
    return Array.from(new Set(listing.bindings.map((b) => b.assemblySlug)));
}

export function OperatorDiscovery() {
    const { listings: allListings, isLoading } = useOperatorListings();

    const [searchQuery, setSearchQuery] = useState("");
    const [assemblyFilter, setAssemblyFilter] = useState<string | null>(null);
    const [fulfilmentFilter, setFulfilmentFilter] = useState<string | null>(null);
    const location = useDeviceLocation(5);

    const knownAssemblies = useMemo(() => {
        const set = new Set<string>();
        for (const l of allListings) {
            for (const slug of listingAssemblies(l)) set.add(slug);
        }
        return Array.from(set).sort();
    }, [allListings]);

    const knownFulfilmentModes = useMemo(() => {
        const set = new Set<string>();
        for (const l of allListings) {
            for (const mode of l.fulfillmentModes) set.add(mode);
        }
        return Array.from(set).sort();
    }, [allListings]);

    const filtered = useMemo(() => {
        let list = allListings;

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(
                (l) =>
                    l.name.toLowerCase().includes(q) ||
                    l.description.toLowerCase().includes(q) ||
                    (l.specialty?.toLowerCase().includes(q) ?? false) ||
                    (l.addressText?.toLowerCase().includes(q) ?? false),
            );
        }

        if (assemblyFilter) {
            list = list.filter((l) => listingAssemblies(l).includes(assemblyFilter));
        }

        if (fulfilmentFilter) {
            list = list.filter((l) => l.fulfillmentModes.includes(fulfilmentFilter as Listing["fulfillmentModes"][number]));
        }

        if (location.geohash) {
            list = list.filter((l) => listingMatchesGeohash(l, location.geohash!));
        }

        return list;
    }, [allListings, searchQuery, assemblyFilter, fulfilmentFilter, location.geohash]);

    const handleAssemblyPillClick = (slug: string) => {
        setAssemblyFilter((current) => (current === slug ? null : slug));
    };

    const handleFulfilmentPillClick = (mode: string) => {
        setFulfilmentFilter((current) => (current === mode ? null : mode));
    };

    return (
        <div className="space-y-6">
            {/* Location prompt */}
            <section className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                    {location.status === "granted" && location.geohash ? (
                        <>
                            <span className="text-gray-700">Filtering near </span>
                            <span className="font-mono text-black">{location.geohash}</span>
                            <button
                                type="button"
                                onClick={location.clear}
                                className="ml-3 text-xs text-gray-500 underline hover:text-black"
                            >
                                clear
                            </button>
                        </>
                    ) : location.status === "requesting" ? (
                        <span className="text-gray-700">Requesting location…</span>
                    ) : location.status === "denied" || location.status === "error" || location.status === "unsupported" ? (
                        <span className="text-gray-700">
                            {location.error ?? "Location unavailable."} You can still browse all operators.
                        </span>
                    ) : (
                        <span className="text-gray-700">
                            Showing all operators. Filter by your location?
                        </span>
                    )}
                </div>
                {location.status !== "granted" && (
                    <button
                        type="button"
                        onClick={location.request}
                        className="text-sm font-semibold text-black border border-gray-300 rounded-md px-3 py-1.5 hover:bg-white"
                    >
                        Use my location
                    </button>
                )}
            </section>

            {/* Search */}
            <section>
                <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search operators…"
                    aria-label="Search operators"
                    className="w-full max-w-md rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
            </section>

            {/* Assembly filter row */}
            <section className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mr-1">
                    Assembly
                </span>
                <button
                    type="button"
                    onClick={() => setAssemblyFilter(null)}
                    className={
                        "text-xs px-2.5 py-1 rounded-full border transition-colors " +
                        (assemblyFilter === null
                            ? "bg-black text-white border-black"
                            : "bg-white text-gray-700 border-gray-300 hover:border-black")
                    }
                >
                    All
                </button>
                {knownAssemblies.map((slug) => (
                    <button
                        key={slug}
                        type="button"
                        onClick={() => setAssemblyFilter(slug === assemblyFilter ? null : slug)}
                        className={
                            "text-xs px-2.5 py-1 rounded-full border transition-colors " +
                            (assemblyFilter === slug
                                ? "bg-black text-white border-black"
                                : "bg-white text-gray-700 border-gray-300 hover:border-black")
                        }
                    >
                        {assemblyLabel(slug)}
                    </button>
                ))}
            </section>

            {/* Fulfilment filter row */}
            <section className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mr-1">
                    Fulfilment
                </span>
                <button
                    type="button"
                    onClick={() => setFulfilmentFilter(null)}
                    className={
                        "text-xs px-2.5 py-1 rounded border transition-colors " +
                        (fulfilmentFilter === null
                            ? "bg-blue-700 text-white border-blue-700"
                            : "bg-white text-blue-700 border-blue-200 hover:border-blue-500")
                    }
                >
                    All
                </button>
                {knownFulfilmentModes.map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => setFulfilmentFilter(mode === fulfilmentFilter ? null : mode)}
                        className={
                            "text-xs px-2.5 py-1 rounded border transition-colors " +
                            (fulfilmentFilter === mode
                                ? "bg-blue-700 text-white border-blue-700"
                                : "bg-white text-blue-700 border-blue-200 hover:border-blue-500")
                        }
                    >
                        {fulfilmentLabel(mode)}
                    </button>
                ))}
            </section>

            <p className="text-xs text-gray-500">
                {isLoading
                    ? "Loading operators…"
                    : `${filtered.length} ${filtered.length === 1 ? "operator" : "operators"} shown of ${allListings.length} total.`}
            </p>

            {/* Listing grid */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((l) => (
                    <OperatorCard
                        key={l.address}
                        listing={l}
                        onAssemblyClick={handleAssemblyPillClick}
                        onFulfilmentClick={handleFulfilmentPillClick}
                    />
                ))}
            </section>

            {filtered.length === 0 && !isLoading && (
                allListings.length === 0 ? (
                    <div className="text-center py-12 space-y-4">
                        <p className="text-base text-gray-700">
                            No operators have registered on this network yet.
                        </p>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                            Every operator is a wallet that has self-registered in <code className="text-xs">OperatorRegistry</code> with
                            an identity, a catalogue, and one or more assembly bindings. Be the first.
                        </p>
                        <a
                            href="/operators/onboard"
                            className="inline-block text-sm px-4 py-2 rounded border border-black bg-black text-white hover:bg-neutral-800"
                            data-testid="discover-empty-cta"
                        >
                            Become an operator
                        </a>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 italic text-center py-8">
                        No operators match the current filters.
                    </p>
                )
            )}
        </div>
    );
}
