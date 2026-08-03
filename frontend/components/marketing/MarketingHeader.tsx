import { HeaderShell } from "@/components/shared/HeaderShell";
import { NAV_LINKS_MARKETING_DRAWER } from "@/components/shared/navLinks";

/**
 * Wagmi-free header for marketing routes (`app/(marketing)/`). Same chrome
 * as `Header.tsx` but without `ConnectWallet` / `YourTurnBadge` /
 * `useWalletConnected` so marketing pages don't pull the wallet provider
 * into their client bundle.
 *
 * Audience CTAs (`BuildButton`, `ReadButton`, the Participate link) live below
 * the three doorways on the homepage (`/`), not in the header — text
 * doesn't visually cue redirection. The header carries the publication-
 * row nav and the logo only.
 *
 * Desktop nav stays the three-doorway publication row; the MOBILE drawer gets
 * the full grouped map (`NAV_LINKS_MARKETING_DRAWER`), because on mobile the
 * row was the only way in and everything behind a doorway was footer-only.
 */
export function MarketingHeader() {
    return <HeaderShell right={null} mobileLinks={NAV_LINKS_MARKETING_DRAWER} />;
}
