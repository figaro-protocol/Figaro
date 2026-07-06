import { HeaderShell } from "@/components/shared/HeaderShell";

/**
 * Wagmi-free header for marketing routes (`app/(marketing)/`). Same chrome
 * as `Header.tsx` but without `ConnectButton` / `YourTurnBadge` /
 * `useWalletConnected` so marketing pages don't pull the wallet provider
 * into their client bundle.
 *
 * Audience CTAs (`BuildButton`, `ReadButton`, the Participate link) live below
 * the three doorways on the homepage (`/`), not in the header — text
 * doesn't visually cue redirection. The header carries the publication-
 * row nav and the logo only.
 */
export function MarketingHeader() {
    return <HeaderShell right={null} />;
}
