import { erc20Abi, type PublicClient } from "viem";
import type { MissingPart } from "./types";

/**
 * The process token's `decimals()`, read from the chain. One currency per
 * process (the Core's rule), so one read covers every amount of an evidence
 * file. A token that does not answer adds a missing part named `part`, whose
 * reason ends with `consequence` (what the file shows in place of the
 * amounts), and yields undefined: never a guessed 18.
 */
export async function readProcessDecimals(
    client: Pick<PublicClient, "readContract">,
    token: `0x${string}`,
    missing: MissingPart[],
    part: string,
    consequence: string,
): Promise<number | undefined> {
    try {
        return Number(await client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }));
    } catch {
        missing.push({ part, reason: `the decimals of the token ${token} could not be read, ${consequence}` });
        return undefined;
    }
}
