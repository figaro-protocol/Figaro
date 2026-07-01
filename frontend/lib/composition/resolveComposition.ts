/**
 * resolveComposition — resolve a composition's concrete `{ address, abi }` from
 * the standard interface a clause names (`block.composes.interface`) plus its
 * optional Level-2 `abiCID`.
 *
 * This is the open-world seam for INVOKING an on-network composition. Per the
 * `lib/composition/contracts.ts` doctrine, an ADDRESS is a deployment fact (env
 * is fine — not prior knowledge the way an ABI is); the ABI is the prior
 * knowledge Level-2 removes. So:
 *
 *   - **ABI** — a pinned `abiCID` (Level 2) takes precedence: a NEVER-SEEN
 *     contract's ABI is fetched from IPFS with zero bundled copy. Absent an
 *     `abiCID`, the bundled Level-1 standard ABI for the interface is used.
 *   - **address** — env-resolved by interface (a deployment fact).
 *
 * The CALL-SHAPE (which function, in what arg order) is NOT resolved here — that
 * is integration code kept in the interface's handler (`useCompositionActions`),
 * per the K1-OW P1 doctrine (separate deployment facts from integration code).
 *
 * Known limitation (K1-OW P1, operator FORK): a never-seen interface has no
 * env-resolvable instance address yet — address self-declaration (chain vs env)
 * is undecided. So `abiCID` makes a novel contract's ABI flow through today; a
 * novel interface's ADDRESS still needs the K1-OW P1 decision.
 */

import type { Abi } from "viem";
import { DUTCH_AUCTION_ABI } from "@/lib/composition/abis";
import { getDutchAuction } from "@/lib/composition/contracts";
import { resolveContentUri } from "@/lib/shared/ipfsService";

export interface ResolvedComposition {
    address: `0x${string}`;
    abi: Abi;
}

/** Level-1 standard interfaces: bundled ABI + env-resolved instance address,
 *  keyed by `block.composes.interface`. Add a row per standard interface; the
 *  ABI here is the fallback when a clause pins no `abiCID`. */
const STANDARD_INTERFACES: Record<string, { address: () => `0x${string}` | null; abi: Abi }> = {
    "descending-auction": { address: getDutchAuction, abi: DUTCH_AUCTION_ABI as unknown as Abi },
};

/** Test-injectable ABI fetcher — mirrors `clauseSpecSource.setClauseSpecFetcher`
 *  so unit tests exercise the abiCID path without a live gateway. */
type AbiFetcher = (cid: string) => Promise<Abi>;

const defaultAbiFetcher: AbiFetcher = async (cid) => {
    const url = resolveContentUri(`ipfs://${cid}`);
    if (!url) throw new Error(`Cannot resolve composition ABI CID: ${cid}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch composition ABI ${cid}: ${res.status} ${res.statusText}`);
    const json: unknown = await res.json();
    if (!Array.isArray(json)) throw new Error(`Composition ABI ${cid} is not a JSON ABI array`);
    return json as Abi;
};

let abiFetcher: AbiFetcher = defaultAbiFetcher;

/** Replace the ABI fetcher (test-only). */
export function setCompositionAbiFetcher(fetcher: AbiFetcher): void {
    abiFetcher = fetcher;
}

/**
 * Resolve the concrete `{ address, abi }` to invoke for a composition. Returns
 * null when no instance address is resolvable for the interface (see the K1-OW
 * P1 limitation above).
 */
export async function resolveComposition(
    interfaceName: string,
    composes?: { abiCID?: string },
): Promise<ResolvedComposition | null> {
    const std = STANDARD_INTERFACES[interfaceName];
    const address = std?.address() ?? null;
    if (!address) return null;
    if (composes?.abiCID) {
        const abi = await abiFetcher(composes.abiCID);
        return { address, abi };
    }
    if (std) return { address, abi: std.abi };
    return null;
}
