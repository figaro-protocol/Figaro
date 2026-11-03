/**
 * RegistryListState — the one ladder every wallet-scoped registration list
 * renders through: mounted, wallet, loading, failed, empty, rows. A failed
 * registry read surfaces nothing for the list (docs/OPEN_WORLD.md § 1 "No
 * fallbacks"): never the empty-state sentence, never error text. Only a read
 * in flight shows a loading line; a resolved-empty read its empty state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;

type Scan = { data: unknown[] | null; isLoading: boolean; failed: boolean; error: string | null; refetch: () => void };

const mocks = vi.hoisted(() => ({
    address: undefined as `0x${string}` | undefined,
    scan: { data: null, isLoading: false, failed: false, error: null, refetch: () => {} } as Scan,
}));

vi.mock("next/link", async () => {
    const React = await import("react");
    return {
        default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
            React.createElement("a", { href, ...rest }, children),
    };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: mocks.address, isConnected: !!mocks.address }),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/protocol/useClauseRegistry", () => ({
    useRegisteredClausesByWallet: () => mocks.scan,
    useWithdrawClause: () => ({ withdraw: async () => undefined }),
}));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({}) }));
vi.mock("@/lib/protocol/registryWrites", () => ({ useRegistryWriteVersion: () => 0 }));
vi.mock("@/lib/protocol/assemblyChoices", () => ({ useAssemblyChoices: () => mocks.scan }));
vi.mock("@/lib/protocol/useAgreementRegistry", () => ({
    usePublishedAgreements: () => mocks.scan,
    useWithdrawAgreement: () => ({ withdraw: async () => undefined }),
    fetchRegisteredAgreement: async () => null,
    getRegisteredAgreement: () => undefined,
    useRegisteredAgreementsVersion: () => 0,
}));

import { ClausesList } from "@/app/(tools)/assemblies/designer/_components/ClausesList";
import { PublishedList } from "@/app/(tools)/assemblies/designer/_components/PublishedList";
import { RegisteredAgreementsReclaim } from "@/app/(tools)/assemblies/designer/_components/RegisteredAgreementsReclaim";
import { RegisteredClausesReclaim } from "@/app/(tools)/clauses/register/_components/RegisteredClausesReclaim";

const LISTS = [
    ["ClausesList", ClausesList],
    ["PublishedList", PublishedList],
    ["RegisteredAgreementsReclaim", RegisteredAgreementsReclaim],
    ["RegisteredClausesReclaim", RegisteredClausesReclaim],
] as const;

describe("registration lists through RegistryListState", () => {
    beforeEach(() => {
        mocks.address = WALLET;
        mocks.scan = { data: null, isLoading: false, failed: false, error: null, refetch: () => {} };
    });

    it.each(LISTS)("%s renders nothing for a failed registry read: no empty-state sentence, no error text", (_name, List) => {
        mocks.scan = { ...mocks.scan, data: [], failed: true, error: "rpc down" };
        const { container } = render(<List />);
        expect(container.textContent ?? "").not.toMatch(/haven.t (registered|published)/);
        expect(container.textContent ?? "").not.toMatch(/rpc down|failed/i);
        expect(container.textContent).toBe("");
    });

    it.each(LISTS)("%s shows its empty state for a resolved-empty read", (_name, List) => {
        mocks.scan = { ...mocks.scan, data: [] };
        const { container } = render(<List />);
        expect(container.textContent ?? "").toMatch(/haven.t (registered|published)/);
    });

    it.each(LISTS)("%s shows a loading line only while the read is in flight", (_name, List) => {
        mocks.scan = { ...mocks.scan, isLoading: true };
        const { container } = render(<List />);
        expect(container.textContent ?? "").toMatch(/Loading/);
    });

    it.each(LISTS)("%s asks for a wallet before reading", (_name, List) => {
        mocks.address = undefined;
        render(<List />);
        expect(screen.getByText(/Connect a wallet/)).toBeTruthy();
    });
});
