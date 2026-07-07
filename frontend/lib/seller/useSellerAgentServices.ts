/**
 * lib/seller/useSellerAgentServices.ts — read a seller's declared agent service
 * endpoints (the `services` block of its profile metadata) BY ADDRESS.
 *
 * The write path (a seller publishes did:web / MCP / A2A / REST / ENS via the
 * agents onboarding step) has always existed; this is its missing READER — the
 * surface that shows another party what a seller published, so an agent (or a
 * human) can verify a did:web binds the seller's on-chain address before
 * transacting. Composes the two sanctioned seller-profile readers
 * (`useSellerProfile` → metadataURI, `fetchSellerProfile` → parsed doc); adds no
 * new fetch path. Resolved-empty = absence (undefined), never a coined default.
 */
import { useEffect, useState } from "react";
import { useSellerProfile } from "@/lib/seller/useSellerRegistry";
import { fetchSellerProfile } from "@/lib/seller/profileFetcher";
import type { SellerAgentServices } from "@/lib/seller/sellerProfileMetadata";

export function useSellerAgentServices(sellerAddress: `0x${string}` | undefined): {
    services: SellerAgentServices | undefined;
    isLoading: boolean;
} {
    const { data: registryData, isLoading: registryLoading } = useSellerProfile(sellerAddress);
    const [services, setServices] = useState<SellerAgentServices | undefined>(undefined);
    const [fetching, setFetching] = useState(false);

    useEffect(() => {
        if (!sellerAddress || !registryData) {
            setServices(undefined);
            return;
        }
        const [metadataURI] = registryData;
        if (!metadataURI) {
            setServices(undefined);
            return;
        }

        let cancelled = false;
        setFetching(true);
        fetchSellerProfile(metadataURI)
            .then((profile) => {
                if (cancelled) return;
                setServices(profile?.services);
                setFetching(false);
            })
            .catch(() => {
                if (cancelled) return;
                setServices(undefined);
                setFetching(false);
            });

        return () => { cancelled = true; };
    }, [sellerAddress, registryData]);

    return { services, isLoading: registryLoading || fetching };
}
