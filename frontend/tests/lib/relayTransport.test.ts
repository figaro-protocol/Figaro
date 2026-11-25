/**
 * The batch path's transport, below the pages: the relay check against the
 * chain (`checkRelay`), the path a signature names (`signedPath`), and the
 * paths a buyer is offered (`offeredPaths`).
 *
 * Real: the check, the SDK's relay client and its status parse, the EIP-712
 * recovery, the path derivation. Stood in for: the relay's HTTP answers and
 * the deployment's addresses.
 */
import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { COMMITMENT_TYPES, buildDomain, type Commitment } from "@figaro-protocol/sdk";

const ADDR = vi.hoisted(() => ({
    core: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    verifier: "0x2222222222222222222222222222222222222222" as `0x${string}`,
}));
vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { contracts: { core: ADDR.core, batchVerifier: ADDR.verifier }, batchVerifier: () => ADDR.verifier }));

import { checkRelay, signedPath } from "@/lib/core/relayTransport";
import { batchShared, offeredPaths } from "@/lib/checkout/pathChoice";
import { relayInUse } from "@/lib/registries/useCheckedRelay";
import { ABSENT, PENDING, present, type NetworkRead } from "@/lib/shared/networkRead";
import type { KnownRelay } from "@/lib/core/useRelayActions";

const VKEY = `0x${"5a".repeat(32)}` as const;
const EXPECTED = { chainId: 31337, batchVerifier: ADDR.verifier, programVKey: VKEY };

function answering(status: Record<string, unknown> | null, code = 200): typeof globalThis.fetch {
    return (async () => new Response(JSON.stringify(status), { status: code })) as typeof globalThis.fetch;
}
const IDENTITY = {
    wire_format_version: 1, chain_id: 31337, batch_verifier: ADDR.verifier, program_vkey: VKEY,
    browser_submit_origins: ["http://page.test"],
    state_root: `0x${"00".repeat(32)}`, pending_ops: 0, pending_usage_claims: 0, batches_settled: 0,
};

describe("checkRelay — a relay is offered only when it proves for the chain's verifier", () => {
    it("passes a relay whose status names the chain, the verifier and the key the verifier holds", async () => {
        const check = await checkRelay("http://relay.test", EXPECTED, answering(IDENTITY));
        expect(check.verdict).toBe("passes");
    });

    it.each([
        ["another verifier", { batch_verifier: "0x4444444444444444444444444444444444444444" }, /lands its batches at the verifier 0x4444/],
        ["another key", { program_vkey: `0x${"77".repeat(32)}` }, /proves under the key 0x7777/],
        ["another chain", { chain_id: 1 }, /reads chain 1, and this page shows chain 31337/],
        ["no key at all", { program_vkey: undefined }, /status could not be read/],
        ["another wire format version", { wire_format_version: 2 }, /status could not be read/],
    ])("fails a relay with %s, and says why", async (_name, override, reason) => {
        const check = await checkRelay("http://relay.test", EXPECTED, answering({ ...IDENTITY, ...override }));
        expect(check.verdict).toBe("fails");
        expect(check.verdict === "fails" && check.reason).toMatch(reason);
    });

    it("passes a relay that lets this page's origin submit, and fails one that does not", async () => {
        const listed = await checkRelay("http://relay.test", { ...EXPECTED, pageOrigin: "http://page.test" }, answering(IDENTITY));
        expect(listed.verdict).toBe("passes");
        const unlisted = await checkRelay("http://relay.test", { ...EXPECTED, pageOrigin: "http://other.test" }, answering(IDENTITY));
        expect(unlisted.verdict === "fails" && unlisted.reason).toMatch(/does not let a page at http:\/\/other\.test submit from a browser/);
    });

    it("fails a URL that is not http or https, without asking it", async () => {
        const fetchSpy = vi.fn(answering(IDENTITY));
        const check = await checkRelay("javascript:alert(1)", EXPECTED, fetchSpy);
        expect(check.verdict).toBe("fails");
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("fails a relay that does not answer", async () => {
        const check = await checkRelay("http://relay.test", EXPECTED, (async () => { throw new Error("refused"); }) as typeof globalThis.fetch);
        expect(check.verdict).toBe("fails");
    });
});

describe("signedPath — the path a signature was made for is the domain it recovers under", () => {
    const signer = privateKeyToAccount(`0x${"0b".repeat(32)}`);
    const commitment: Commitment = {
        processId: `0x${"00".repeat(32)}`, buyer: signer.address, seller: "0x00000000000000000000000000000000000000a1",
        token: "0x00000000000000000000000000000000000000c1", payment: 10n, runningTotal: 10n,
        checkoutHash: `0x${"cc".repeat(32)}`, salt: 1n, commitDeadline: 2_000_000_000n,
    };
    const signFor = (contract: `0x${string}`) => signer.signTypedData({
        domain: buildDomain(31337, contract), types: COMMITMENT_TYPES, primaryType: "Commitment", message: commitment,
    });

    it("a signature under FigaroCore's domain names the direct path", async () => {
        expect(await signedPath(commitment, await signFor(ADDR.core), signer.address, 31337)).toBe("direct");
    });

    it("a signature under the batch verifier's domain names the batch path", async () => {
        expect(await signedPath(commitment, await signFor(ADDR.verifier), signer.address, 31337)).toBe("batch");
    });

    it("a signature under another contract's domain names no path", async () => {
        expect(await signedPath(commitment, await signFor("0x3333333333333333333333333333333333333333"), signer.address, 31337)).toBeNull();
    });
});

describe("offeredPaths — the intersection of every named seller's paths, as a read", () => {
    const P = (paths: ("direct" | "batch")[]): NetworkRead<readonly ("direct" | "batch")[]> => present(paths);
    const relay = present(true);
    const noRelay = present(false);
    const withVerifier = (relayInUse: NetworkRead<boolean>) => ({ verifier: true, relayInUse });
    it.each([
        ["a seller accepting both, with a relay in use", [P(["direct", "batch"])], withVerifier(relay), present(["direct", "batch"])],
        ["a seller declaring none (the direct path)", [P(["direct"])], withVerifier(relay), present(["direct"])],
        ["a seller accepting both, with no relay in use", [P(["direct", "batch"])], withVerifier(noRelay), present(["direct"])],
        ["a seller accepting both, on a deployment with no verifier", [P(["direct", "batch"])], { verifier: false, relayInUse: relay }, present(["direct"])],
        ["a lead accepting the direct path alone beside a co-seller accepting the batch path alone", [P(["direct"]), P(["batch"])], withVerifier(relay), present([])],
        ["a lead accepting both beside a co-seller declaring none", [P(["direct", "batch"]), P(["direct"])], withVerifier(relay), present(["direct"])],
        ["a seller accepting the batch path alone, with no relay in use", [P(["batch"])], withVerifier(noRelay), present([])],
        ["a co-seller whose binding is still read", [P(["direct", "batch"]), PENDING], withVerifier(relay), PENDING],
        ["a co-seller whose binding could not be read", [P(["direct"]), ABSENT], withVerifier(relay), ABSENT],
        ["a batch path every seller shares, while the relays are checked", [P(["direct", "batch"])], withVerifier(PENDING), PENDING],
        ["no seller named yet", [], withVerifier(relay), PENDING],
    ] as const)("%s", (_name, sellers, batch, offered) => {
        expect(offeredPaths(sellers as unknown as NetworkRead<readonly ("direct" | "batch")[]>[], batch as { verifier: boolean; relayInUse: NetworkRead<boolean> })).toEqual(offered);
    });

    it("reads the relays only once every seller's binding is read and all share the batch path", () => {
        expect(batchShared([P(["direct", "batch"]), P(["batch"])])).toBe(true);
        expect(batchShared([P(["direct", "batch"]), PENDING])).toBe(false);
        expect(batchShared([P(["direct", "batch"]), P(["direct"])])).toBe(false);
        expect(batchShared([])).toBe(false);
    });
});

describe("relayInUse — no relay is picked in silence among several", () => {
    const r = (url: string) => ({ url, client: {} }) as unknown as KnownRelay;
    const one = r("http://one.test");
    const two = r("http://two.test");
    it("the relay the wallet's setting names, when it passes", () => {
        expect(relayInUse([one, two], "http://two.test", null)).toBe(two);
    });
    it("the only relay that passes", () => {
        expect(relayInUse([one], null, null)).toBe(one);
    });
    it("none among several until the holder chooses, then the chosen one", () => {
        expect(relayInUse([one, two], null, null)).toBeNull();
        expect(relayInUse([one, two], "http://failed.test", null)).toBeNull();
        expect(relayInUse([one, two], null, "http://one.test")).toBe(one);
    });
    it("none when none passes", () => {
        expect(relayInUse([], "http://one.test", "http://one.test")).toBeNull();
    });
});
