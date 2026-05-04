import { BuildButton } from "@/components/shared/BuildButton";
import { DiscoverButton } from "@/components/shared/DiscoverButton";
import { HeaderShell } from "@/components/shared/HeaderShell";

/**
 * Wagmi-free header for marketing routes (`app/(marketing)/`). Same chrome
 * as `Header.tsx` but without `ConnectButton` / `NotificationBell` /
 * `useWalletConnected` so marketing pages don't pull the wallet provider
 * into their client bundle. Pure-publication routes like `/`, `/about`,
 * `/protocol`, `/cryptoeconomics`, `/spec`, etc. mount this; transactional
 * and reference routes mount the full `Header.tsx` via
 * `app/(app)/layout.tsx`.
 *
 * Two parallel audience CTAs live here (and only here):
 *   - Discover → /discover (consumers) — filled
 *   - Build → /builders (builders) — outline
 * Both are marketing-surface CTAs. The (app) tier is for transacting —
 * Connect Wallet there, no Discover, no Build.
 */
export function MarketingHeader() {
    return (
        <HeaderShell
            right={
                <>
                    <DiscoverButton />
                    <BuildButton />
                </>
            }
            mobileTopCta={
                <div className="flex flex-col gap-2">
                    <DiscoverButton className="inline-flex w-full justify-center" />
                    <BuildButton className="inline-flex w-full justify-center" />
                </div>
            }
        />
    );
}
