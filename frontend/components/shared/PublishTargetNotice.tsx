"use client";

import Link from "@/components/shared/Link";
import { useMounted } from "@/hooks/useMounted";
import { NO_PUBLISH_TARGET_LINE, activePublishTarget } from "@/lib/shared/ipfsService";

/** Where this browser's IPFS node and pinning service are set. */
const ENDPOINTS_SETTING_HREF = "/members/edit/endpoints";

/**
 * The one line a publishing page shows when this browser has no IPFS node and
 * no pinning service set: no build carries a pinning account, so a publish has
 * nowhere to go until the user names its own (`activePublishTarget`). It
 * offers the setting. Renders nothing before mount (the setting lives in this
 * browser's storage), nothing once a node or a service is set, and nothing on
 * the setting's own pages, where the form is the offer.
 */
/** Whether this page is the setting itself (read after mount, from the URL). */
function onSettingPage(): boolean {
    return window.location.pathname.replace(/\/$/, "").endsWith("/endpoints");
}

export function PublishTargetNotice({ className = "" }: { className?: string }) {
    const mounted = useMounted();
    if (!mounted || activePublishTarget() || onSettingPage()) return null;
    return (
        <p className={`text-sm text-ink-muted ${className}`} data-testid="publish-target-notice">
            {NO_PUBLISH_TARGET_LINE}{" "}
            <Link href={ENDPOINTS_SETTING_HREF} className="underline">
                Set one
            </Link>
            .
        </p>
    );
}
