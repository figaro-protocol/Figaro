/**
 * relayTransport.ts — the batch path's transport: a relay, checked against
 * the chain before anything is sent to it.
 *
 * A trade on the batch path is signed under `FigaroBatchVerifier`'s EIP-712
 * domain and sent to a relay, which has it proved and submits the batch
 * (`docs/SCALING_STRATEGY.md`). There is no one relay and no bundled URL: a
 * relay is a URL the wallet's own setting names, or one a member's profile
 * lists among its services (`profileRelayUrl`). Whatever its source, a relay
 * is offered only when its `/status` names the chain, the verifier and the
 * guest fingerprint this page reads on the chain (`checkRelay`). The relay's
 * HTTP interface is the SDK's published format (`relay-wire.schema.json`),
 * spoken through `SequencerClient`.
 */
import {
    BATCH_VERIFIER_ABI,
    verifyCommitmentSignature,
    type Commitment,
    type ResolutionUniverse,
} from "@figaro-protocol/sdk";
import { SequencerClient } from "@figaro-protocol/sdk/agent";
import { readStorage, removeStorage, writeStorage } from "@/lib/shared/storage";
import { hexEqual } from "@/lib/shared/evm";
import { getBatchVerifier } from "@/lib/core/contracts";
import { pathContract } from "@/lib/core/signedCommitment";

/** The storage key of the relay URL the wallet's own setting names. */
const RELAY_SETTING_KEY = "figaro-relay-url";

/** The relay URL this browser's setting names, or null. */
export function readRelaySetting(): string | null {
    const url = readStorage(RELAY_SETTING_KEY)?.trim();
    return url ? url : null;
}

/** Keep `url` as this browser's relay setting; an empty value removes it.
 *  False when storage refused the write. */
export function writeRelaySetting(url: string): boolean {
    const trimmed = url.trim();
    if (!trimmed) {
        removeStorage(RELAY_SETTING_KEY);
        return true;
    }
    return writeStorage(RELAY_SETTING_KEY, trimmed);
}

/** What a relay must report to be offered: the page's chain, the
 *  deployment's batch verifier, the key that verifier holds on chain, and,
 *  for a page that submits from a browser, the page's own origin among those
 *  its operator lets submit. */
interface RelayExpectation {
    chainId: number;
    batchVerifier: `0x${string}`;
    programVKey: `0x${string}`;
    pageOrigin?: string;
}

/** One relay, checked: it passes, with a client to send through, or it fails,
 *  with the fact that failed it. */
export type RelayCheck =
    | { url: string; verdict: "passes"; client: SequencerClient }
    | { url: string; verdict: "fails"; reason: string };

/**
 * Check the relay at `url`: its `/status` must answer in the published
 * format, and the chain id, verifier address and program key it reports must
 * equal the connected chain's id, the deployment's `FigaroBatchVerifier`
 * and the value `FigaroBatchVerifier.programVKey()` returns. A relay for
 * another verifier lands its batches nowhere this page reads; one proving another
 * guest makes proofs the verifier refuses. With `pageOrigin`, the relay must
 * also list it among the origins that may submit from a browser
 * (`browser_submit_origins`), or the browser refuses the page's POST. The
 * relay's report is compared, never proved: what it does with an operation
 * shows on the chain once its batch lands.
 */
export async function checkRelay(
    url: string,
    expected: RelayExpectation,
    fetchImpl?: typeof globalThis.fetch,
): Promise<RelayCheck> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { url, verdict: "fails", reason: "the relay URL is not a URL" };
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { url, verdict: "fails", reason: "the relay URL is not an http or https URL" };
    }
    const client = new SequencerClient({ url, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
    let status: Awaited<ReturnType<SequencerClient["status"]>>;
    try {
        status = await client.status();
    } catch (error) {
        return { url, verdict: "fails", reason: `the relay's status could not be read: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (status.chain_id !== expected.chainId) {
        return { url, verdict: "fails", reason: `the relay reads chain ${status.chain_id}, and this page shows chain ${expected.chainId}` };
    }
    if (!hexEqual(status.batch_verifier, expected.batchVerifier)) {
        return { url, verdict: "fails", reason: `the relay lands its batches at the verifier ${status.batch_verifier}, and this deployment's verifier is ${expected.batchVerifier}` };
    }
    if (!hexEqual(status.program_vkey, expected.programVKey)) {
        return { url, verdict: "fails", reason: `the relay proves under the key ${status.program_vkey}, and the verifier holds ${expected.programVKey}` };
    }
    if (expected.pageOrigin !== undefined && !status.browser_submit_origins.includes(expected.pageOrigin)) {
        return { url, verdict: "fails", reason: `the relay's operator does not let a page at ${expected.pageOrigin} submit from a browser` };
    }
    return { url, verdict: "passes", client };
}

/** The subset of a viem client the verifier's key read needs. */
interface ContractReader {
    readContract(args: { address: `0x${string}`; abi: typeof BATCH_VERIFIER_ABI; functionName: "programVKey" }): Promise<unknown>;
}

/** The key the deployment's batch verifier holds (`programVKey`, immutable).
 *  Throws when the deployment names no verifier or the read fails. */
export async function readProgramVKey(client: ContractReader): Promise<`0x${string}`> {
    const verifier = getBatchVerifier();
    if (!verifier) throw new Error("This deployment names no batch verifier.");
    return await client.readContract({ address: verifier, abi: BATCH_VERIFIER_ABI, functionName: "programVKey" }) as `0x${string}`;
}

/**
 * The path a commitment's signature was made for: the path whose contract's
 * EIP-712 domain the signature recovers to `signer` under. The two domains
 * differ in their `verifyingContract`, so one signature verifies under one
 * path at most. Null when it verifies under neither. A deployment with no
 * batch verifier has the direct path alone.
 */
export async function signedPath(
    commitment: Commitment,
    signature: `0x${string}`,
    signer: `0x${string}`,
    chainId: number,
): Promise<ResolutionUniverse | null> {
    const paths: ResolutionUniverse[] = getBatchVerifier() ? ["direct", "batch"] : ["direct"];
    for (const path of paths) {
        if (await verifyCommitmentSignature(commitment, signature, signer, { chainId, core: pathContract(path) })) {
            return path;
        }
    }
    return null;
}
