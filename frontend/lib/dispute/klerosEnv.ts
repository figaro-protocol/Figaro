import type { Address } from "viem";
import type { KlerosConfig } from "@/lib/dispute/klerosProxy";

/**
 * Read Kleros configuration from environment variables.
 *
 * Returns null when `NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY` isn't set —
 * callers should render as "not configured" in that case. Used by the
 * /dispute page, useArbitrationCost, and any view-tier module that
 * wraps the dispute surface.
 */
export function getKlerosConfigFromEnv(): KlerosConfig | null {
    const proxy = process.env.NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY;
    const extraData = process.env.NEXT_PUBLIC_KLEROS_ARBITRATOR_EXTRA_DATA;
    if (!proxy) return null;
    return {
        arbitrableProxy: proxy as Address,
        arbitratorExtraData: (extraData ?? "0x") as `0x${string}`,
    };
}
