/**
 * The designer landing's reclaim of a registered agreement's stake
 * (`/assemblies/designer`, `RegisteredAgreementsReclaim` → `ReclaimStakeRow`)
 * is refused while a verified trade composed from the agreement is open, and
 * allowed once none is.
 *
 * Unlike `RegisteredAgreementsReclaim.test.tsx`, which hands the row a gate,
 * this drives the real gate (`useWithdrawGate` → `getCoreEvents` → the SDK's
 * `deriveInFlightOrders` and `deriveAgreementWithdrawGate`) from Core order
 * logs: the bytes a node returns, decoded by the SDK's parsers. Only the event
 * cache's network call, the registry list, the wallet and the agreement body
 * fetch are stood in for. "Verified" is the gate's word: this wallet witnessed
 * the order's agreement, and the body's provenance names the agreement.
 *
 * Proves, on each order emitter (FigaroCore and FigaroBatchVerifier): an open
 * order whose verified agreement names this agreement disables the reclaim
 * and its title names the count, as `withdrawBlockedReason` words it; the
 * same order once resolved, or an open order of another agreement, leaves the
 * reclaim enabled.
 *
 * Does not prove: that a page in a browser reaches this state from a real
 * checkout (agreement-withdraw.devnet.spec.ts drives the open gate only).
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { orderCommittedLog, orderResolvedLog, processResolvedLog, word, type FixtureLog } from "../lib/__fixtures__/coreLogs";

const { cachedGetLogsMock, CORE, VERIFIER, CLIENT, DESIGNER, KEY, scan, bodies } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    CORE: "0x1111111111111111111111111111111111111111",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    CLIENT: { chain: { id: 31337 } },
    DESIGNER: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const,
    KEY: `0x${"a1".repeat(32)}` as const,
    scan: { read: { status: "present", value: [] as unknown[] }, refetch: () => undefined },
    /** checkoutHash → the agreement body this wallet witnessed for it. */
    bodies: new Map<string, unknown>(),
}));

vi.mock("next/link", async () => {
    const React = await import("react");
    return {
        default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
            React.createElement("a", { href, ...rest }, children),
    };
});
vi.mock("wagmi", () => ({ useAccount: () => ({ address: DESIGNER, isConnected: true }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));
vi.mock("@/lib/shared/wagmi", () => ({ publicClient: CLIENT, activeChain: { id: 31337 } }));
vi.mock("@/lib/protocol/useAgreementRegistry", () => ({
    usePublishedAgreements: () => scan,
    fetchRegisteredAgreement: async () => null,
    getRegisteredAgreement: () => undefined,
    useRegisteredAgreementsVersion: () => 0,
}));
vi.mock("@/lib/protocol/useWithdrawStake", () => ({
    useWithdrawAgreement: () => ({ withdraw: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/core/agreementFetch", () => ({
    witnessedAgreementUri: (checkoutHash: string) => (bodies.has(checkoutHash.toLowerCase()) ? `ipfs://witnessed-${checkoutHash.slice(2, 10)}` : null),
    fetchAgreement: async (checkoutHash: string) => {
        const body = bodies.get(checkoutHash.toLowerCase());
        return body ? { status: "present", value: body } : { status: "absent" };
    },
}));

import { RegisteredAgreementsReclaim } from "@/app/(tools)/assemblies/designer/_components/RegisteredAgreementsReclaim";

const PROCESS = word(0x9a7e);
const ORDER = word(0x0de1);
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
// `orderCommittedLog` commits every order under this checkoutHash.
const CHECKOUT = word(0xc4ec);
const OTHER_AGREEMENT = `0x${"b2".repeat(32)}`;

/** `emitter` emits `logs`, each under its own event name; the other order emitter emits nothing. */
function emits(emitter: string, logs: Record<string, FixtureLog[]>) {
    cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        opts.address.toLowerCase() === emitter.toLowerCase() ? (logs[opts.eventName] ?? []) : [],
    );
}

/** The agreement body a party holds: its clauses, and the provenance naming the registered agreement it was composed from. */
const body = (agreementHash: string) => ({
    version: "a1", buyer: BUYER, seller: SELLER, clauses: [],
    provenance: { agreementHash, assemblyHash: `0x${"cc".repeat(32)}` },
});

async function reclaimButton(): Promise<HTMLButtonElement> {
    const button = (await screen.findByTestId("agreement-withdraw-button")) as HTMLButtonElement;
    // Pending also disables: wait until the gate is read.
    await waitFor(() => expect(button.title).not.toMatch(/Checking for in-flight trades/));
    return button;
}

describe.each([
    ["FigaroCore", CORE],
    ["FigaroBatchVerifier", VERIFIER],
])("the agreement reclaim, gated by orders %s emitted", (_name, emitter) => {
    beforeEach(() => {
        cachedGetLogsMock.mockReset();
        bodies.clear();
        scan.read = {
            status: "present",
            value: [{ agreementHash: KEY, registeredBy: DESIGNER, contentURI: "ipfs://agreement", blockNumber: 3n, transactionHash: word(0xabc), stakeWithdrawn: false }],
        };
    });

    const committed = () => orderCommittedLog({ address: emitter, blockNumber: 4n, orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER });

    it("refuses while an open, verified trade composes the agreement, naming the count", async () => {
        bodies.set(CHECKOUT, body(KEY));
        emits(emitter, { OrderCommitted: [committed()] });
        render(<RegisteredAgreementsReclaim />);
        const button = await reclaimButton();
        expect(button.disabled).toBe(true);
        expect(button.title).toBe(
            "Cannot reclaim the stake yet: 1 in-flight trade still composes this registration. The stake frees once every composed trade has resolved.",
        );
        expect(screen.queryByTestId("agreement-withdraw-caveat")).toBeNull();
    });

    it("allows once that trade has resolved", async () => {
        bodies.set(CHECKOUT, body(KEY));
        emits(emitter, {
            OrderCommitted: [committed()],
            OrderResolved: [orderResolvedLog({ address: emitter, blockNumber: 9n, orderHash: ORDER, processId: PROCESS })],
            ProcessResolved: [processResolvedLog({ address: emitter, blockNumber: 9n, processId: PROCESS, buyer: BUYER })],
        });
        render(<RegisteredAgreementsReclaim />);
        const button = await reclaimButton();
        await waitFor(() => expect(button.disabled).toBe(false));
        expect(button.title).toMatch(/^Reclaim your registration stake\./);
    });

    it("allows while the only open, verified trade composes another agreement", async () => {
        bodies.set(CHECKOUT, body(OTHER_AGREEMENT));
        emits(emitter, { OrderCommitted: [committed()] });
        render(<RegisteredAgreementsReclaim />);
        const button = await reclaimButton();
        await waitFor(() => expect(button.disabled).toBe(false));
    });
});
