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
 */
export function MarketingHeader() {
    return <HeaderShell right={<DiscoverButton />} />;
}
