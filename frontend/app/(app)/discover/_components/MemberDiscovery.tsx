"use client";

import { useMemo, useState } from "react";
import { deriveAssemblySlug } from "@/lib/shared/assembly";
import { MemberCard } from "./MemberCard";
import { useDeviceLocation } from "./useDeviceLocation";
import { useMounted } from "@/hooks/useMounted";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
    listingMatchesGeohash,
    type Listing,
} from "@/lib/member/memberListing";
import { useMemberListings } from "@/lib/member/useMemberListings";

function listingAssemblies(listing: Listing): string[] {
    return Array.from(new Set(listing.bindings.map((b) => deriveAssemblySlug(b.assemblyHash))));
}

export function MemberDiscovery() {
    const { read } = useMemberListings();
    // Until this page has mounted and read the registry, nothing has been
    // resolved — so the static shell (what a crawler or a curl reader gets) and
    // the first paint say "loading", never "0 members": resolved-empty is
    // absence, unresolved is not. A failed read renders nothing.
    const mounted = useMounted();
    const isLoading = !mounted || read.status === "pending";
    const failed = read.status === "absent";
    const allListings = useMemo(() => (read.status === "present" ? read.value : []), [read]);

    const [searchQuery, setSearchQuery] = useState("");
    const [assemblyFilter, setAssemblyFilter] = useState<string | null>(null);
    const location = useDeviceLocation(5);

    const knownAssemblies = useMemo(() => {
        const set = new Set<string>();
        for (const l of allListings) {
            for (const slug of listingAssemblies(l)) set.add(slug);
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

        if (location.geohash) {
            list = list.filter((l) => listingMatchesGeohash(l, location.geohash!));
        }

        return list;
    }, [allListings, searchQuery, assemblyFilter, location.geohash]);

    const handleAssemblyPillClick = (slug: string) => {
        setAssemblyFilter((current) => (current === slug ? null : slug));
    };

    return (
        <div className="space-y-6">
            {/* Location prompt */}
            <section className="rounded-lg border border-default bg-subtle px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                    {location.status === "granted" && location.geohash ? (
                        <>
                            <span className="text-ink-body">Filtering near </span>
                            <span className="font-mono text-ink-primary">{location.geohash}</span>
                            <Button
                                type="button"
                                variant="link"
                                size="inline"
                                onClick={location.clear}
                                className="ml-3 text-xs text-ink-muted underline hover:text-ink-primary"
                            >
                                clear
                            </Button>
                        </>
                    ) : location.status === "requesting" ? (
                        <span className="text-ink-body">Requesting location…</span>
                    ) : location.status === "denied" || location.status === "error" || location.status === "unsupported" ? (
                        <span className="text-ink-body">
                            {location.error ?? "Location unavailable."} You can still browse all members.
                        </span>
                    ) : (
                        <span className="text-ink-body">
                            Showing all members. Filter by your location?
                        </span>
                    )}
                </div>
                {location.status !== "granted" && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={location.request}
                        className="text-sm font-semibold bg-transparent border-default rounded-md py-1.5 hover:bg-paper"
                    >
                        Use my location
                    </Button>
                )}
            </section>

            {/* Search */}
            <section>
                <Input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search members…"
                    aria-label="Search members"
                    className="max-w-md rounded-md focus-visible:border-transparent"
                />
            </section>

            {/* Assembly filter row */}
            <section className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-semibold text-ink-muted mr-1">
                    Assembly
                </span>
                <Button
                    type="button"
                    variant={assemblyFilter === null ? "default" : "outline"}
                    size="compact"
                    onClick={() => setAssemblyFilter(null)}
                    className={
                        "px-2.5 py-1 rounded-full " +
                        (assemblyFilter === null
                            ? ""
                            : "text-ink-body border-default hover:bg-paper hover:border-default-strong")
                    }
                >
                    All
                </Button>
                {knownAssemblies.map((slug) => (
                    <Button
                        key={slug}
                        type="button"
                        variant={assemblyFilter === slug ? "default" : "outline"}
                        size="compact"
                        onClick={() => setAssemblyFilter(slug === assemblyFilter ? null : slug)}
                        className={
                            "px-2.5 py-1 rounded-full " +
                            (assemblyFilter === slug
                                ? ""
                                : "text-ink-body border-default hover:bg-paper hover:border-default-strong")
                        }
                    >
                        {slug}
                    </Button>
                ))}
            </section>

            {/* A failed read is unknown chain state: nothing renders for it —
                no count, no "no members registered", no error text. */}
            {failed ? null : (
                <p className="text-xs text-ink-muted">
                    {isLoading
                        ? "Loading members…"
                        : `${filtered.length} ${filtered.length === 1 ? "member" : "members"} shown of ${allListings.length} total.`}
                </p>
            )}

            {/* Listing grid */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((l) => (
                    <MemberCard
                        key={l.address}
                        listing={l}
                        onAssemblyClick={handleAssemblyPillClick}
                    />
                ))}
            </section>

            {filtered.length === 0 && !isLoading && !failed && (
                allListings.length === 0 ? (
                    <div className="text-center py-12 space-y-4">
                        <p className="text-base text-ink-body">
                            No members registered where this page is looking.
                        </p>
                        <p className="text-sm text-ink-muted max-w-md mx-auto">
                            Every member listed here is a wallet that registered itself &mdash;
                            an identity, a catalog, accepted tokens; no application, no
                            approval, no one to say yes. You can be the first.
                        </p>
                        <a
                            href="/members"
                            className="inline-block text-sm px-4 py-2 rounded border border-ink-primary bg-ink-primary text-paper hover:bg-ink-body"
                            data-testid="discover-empty-cta"
                        >
                            Register as a member
                        </a>
                    </div>
                ) : (
                    <p className="text-sm text-ink-muted italic text-center py-8">
                        No members match the current filters.
                    </p>
                )
            )}
        </div>
    );
}
