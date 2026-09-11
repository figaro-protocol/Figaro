"use client";

import { usePathname } from "next/navigation";
import { SPLIT_SITES, currentSite, siteLabel } from "@/lib/shared/sites";

/** The host's own name beside the logo when the sites are split — Use, Build,
 *  or Core — so a reader always knows which site they are on. Nothing on the
 *  apex, and nothing at all on one host. */
export function SiteName() {
    const pathname = usePathname() ?? "/";
    if (!SPLIT_SITES) return null;
    const label = siteLabel(currentSite(pathname));
    if (!label) return null;
    return (
        <span className="text-sm font-medium text-ink-muted border-l border-default pl-3" data-testid="site-name">
            {label}
        </span>
    );
}
