/**
 * The registration lists of one address (`/assemblies/designer`: the published
 * assemblies, the registered agreements, the registered clauses;
 * `/clauses/register`: the registered clauses) with no wallet connected.
 *
 * Reading needs no wallet: the address is the connected wallet's or the one
 * `?wallet=0x…` names (`useViewedWallet`, the helper `/orders` reads it with).
 * - A named address with no wallet connected: the rows are that address's
 *   registrations, read-only; no "Reclaim stake" control is offered.
 * - A connected wallet that is not the address shown: no reclaim either; only
 *   the registrant signs `withdrawDeposit`.
 * - No address at all: the list is by definition one address's and has
 *   nothing to show. Its place carries one line saying so, with a link to
 *   `/registries`; the per-address read is never started with no address
 *   (given none, the registry scans read every registration); no connect
 *   button, no loading line, no "you have none" sentence.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WithdrawGate } from "@figaro-protocol/sdk/derive";

const NAMED = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const OTHER = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" as const;
const KEY = `0x${"a1".repeat(32)}` as const;

const m = vi.hoisted(() => ({
    connected: undefined as `0x${string}` | undefined,
    named: undefined as `0x${string}` | undefined,
    /** Every address a per-address read was started with. */
    readFor: [] as (string | undefined)[],
}));

vi.mock("next/link", async () => {
    const React = await import("react");
    return {
        default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
            React.createElement("a", { href, ...rest }, children),
    };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: m.connected, isConnected: !!m.connected }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
// The helper's rule: the connected wallet, else the address ?wallet= names.
// `named` set beside `connected` stands for a list whose address is not the
// connected wallet.
vi.mock("@/lib/shared/viewedWallet", () => ({
    useViewedWallet: (connected: `0x${string}` | undefined) => m.named ?? connected,
}));

/** Each hook's read: the address's one registration, recorded by the address it was read for. */
const reads = vi.hoisted(() => {
    const key = `0x${"a1".repeat(32)}`;
    const tx = `0x${"ab".repeat(32)}`;
    const presentFor = (row: (by: string) => object) => (subject: string | undefined) => {
        m.readFor.push(subject);
        return { read: subject ? { status: "present", value: [row(subject)] } : { status: "pending" }, refetch: () => {} };
    };
    return {
        clauses: presentFor((by) => ({ clauseKey: key, contentURI: "ipfs://QmClause", registeredBy: by, blockNumber: 7n, transactionHash: tx, stakeWithdrawn: false })),
        agreements: presentFor((by) => ({ agreementHash: key, contentURI: "ipfs://QmAgreement", registeredBy: by, blockNumber: 7n, transactionHash: tx, stakeWithdrawn: false })),
        assemblies: presentFor((by) => ({
            processDesignHash: key, slug: "point-of-sale", name: "Point of sale", contentURI: "ipfs://QmAssembly",
            registeredBy: by, blockNumber: 7n, state: "loaded", hydratedAssembly: null,
        })),
    };
});

vi.mock("@/lib/protocol/useRegisterClause", () => ({ useRegisteredClausesByWallet: reads.clauses }));
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: reads.assemblies }));
vi.mock("@/lib/protocol/useAgreementRegistry", () => ({
    usePublishedAgreements: reads.agreements,
    fetchRegisteredAgreement: async () => null,
    getRegisteredAgreement: () => ({ name: "Courier leg", clauses: {} }),
    useRegisteredAgreementsVersion: () => 0,
}));
vi.mock("@/lib/protocol/useWithdrawStake", () => ({
    useWithdrawClause: () => ({ withdraw: async () => undefined }),
    useWithdrawAgreement: () => ({ withdraw: async () => undefined }),
}));
vi.mock("@/lib/protocol/withdrawGate", async () => {
    const actual = await vi.importActual<typeof import("@/lib/protocol/withdrawGate")>("@/lib/protocol/withdrawGate");
    const open = { canWithdraw: true, inFlightCount: 0, unverifiedCount: 0 } as WithdrawGate;
    return { ...actual, useWithdrawGate: () => ({ gate: { status: "present", value: open } }) };
});
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({}) }));
vi.mock("@/lib/protocol/registryWrites", () => ({ useRegistryWriteVersion: () => 0 }));
vi.mock("@/components/assemblies/AssemblyShapeLine", () => ({ AssemblyShapeLine: () => null }));

import { ClausesList } from "@/app/(tools)/assemblies/designer/_components/ClausesList";
import { PublishedList } from "@/app/(tools)/assemblies/designer/_components/PublishedList";
import { RegisteredAgreementsReclaim } from "@/app/(tools)/assemblies/designer/_components/RegisteredAgreementsReclaim";
import { RegisteredClausesReclaim } from "@/app/(tools)/clauses/register/_components/RegisteredClausesReclaim";

/** Each list: its component, its test-id prefix, its row's test id, its reclaim control's test id, its public list. */
const LISTS = [
    ["ClausesList", ClausesList, "clauses", `clause-row-${KEY}`, null, "/registries?family=clauses"],
    ["PublishedList", PublishedList, "published", "published-row-point-of-sale", null, "/registries?family=assemblies"],
    ["RegisteredAgreementsReclaim", RegisteredAgreementsReclaim, "agreements-reclaim", `agreement-reclaim-row-${KEY}`, "agreement-withdraw-button", "/registries?family=agreements"],
    ["RegisteredClausesReclaim", RegisteredClausesReclaim, "clauses-reclaim", `clause-reclaim-row-${KEY}`, "clause-withdraw-button", "/registries?family=clauses"],
] as const;

beforeEach(() => {
    m.connected = undefined;
    m.named = undefined;
    m.readFor = [];
});

describe("a registration list with no wallet connected", () => {
    it.each(LISTS)("%s, a named address: its rows show, read-only, and no hint to connect stands in for them", (_n, List, prefix, rowId, reclaimId) => {
        m.named = NAMED;
        const { container } = render(<List />);
        expect(screen.getByTestId(rowId)).toBeInTheDocument();
        expect(m.readFor.every((a) => a === NAMED)).toBe(true);
        expect(screen.queryByTestId(`${prefix}-no-address`)).toBeNull();
        expect(container.textContent).not.toMatch(/Connect a wallet to see/);
        if (reclaimId) expect(screen.queryByTestId(reclaimId)).toBeNull();
    });

    it.each(LISTS)("%s, no address at all: one line says so and links the public list; no read, no loading, no empty sentence", (_n, List, prefix, _rowId, _reclaimId, publicHref) => {
        const { container } = render(<List />);
        const line = screen.getByTestId(`${prefix}-no-address`);
        expect(line.textContent).toMatch(/of one address, and this page names none/);
        expect(line.querySelector("a")?.getAttribute("href")).toBe(publicHref);
        expect(m.readFor).toEqual([]);
        expect(container.textContent).not.toMatch(/Loading|haven.t|has (registered|published) no/);
        expect(container.querySelector("button")).toBeNull();
    });
});

describe("the reclaim is offered to the registrant only", () => {
    it.each(LISTS.filter(([, , , , reclaimId]) => reclaimId !== null))("%s: a connected wallet that is not the address shown is offered no reclaim", (_n, List, _p, rowId, reclaimId) => {
        m.connected = OTHER;
        m.named = NAMED;
        render(<List />);
        expect(screen.getByTestId(rowId)).toBeInTheDocument();
        expect(screen.queryByTestId(reclaimId as string)).toBeNull();
    });

    it.each(LISTS.filter(([, , , , reclaimId]) => reclaimId !== null))("%s: the connected wallet, shown, is offered the reclaim of its own registration", (_n, List, _p, rowId, reclaimId) => {
        m.connected = NAMED;
        render(<List />);
        expect(screen.getByTestId(rowId)).toBeInTheDocument();
        expect(screen.getByTestId(reclaimId as string)).toBeInTheDocument();
    });
});
