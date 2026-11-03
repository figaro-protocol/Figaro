/**
 * CheckoutView — a failed catalog read renders nothing: never "Member not
 * found / No member page for 0x…".
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const SELLER = "0x00000000000000000000000000000000000000aa";

vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => ({ chain: { id: 31337 } }) }));
// The failed read in both shapes: as the old hook reported it (an empty
// catalog list, not loading) and as the one read primitive's `absent`.
const CATALOGS = { catalogs: [], isLoading: false, read: { status: "absent" } };
vi.mock("@/lib/member/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => CATALOGS }));
const BOUND = Object.assign({ assemblies: [] }, { status: "absent" });
vi.mock("@/lib/member/useMemberBoundAssemblies", () => ({
    useMemberBoundAssemblies: () => BOUND,
    withBoundCoSellers: (a: unknown) => a,
}));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: undefined }),
    useCheckout: () => ({
        decimals: 18, decimalsReady: true, balance: undefined, needsAuthorization: () => false, authorize: vi.fn(),
        authorization: { isPending: false, isConfirming: false, isSuccess: false, isError: false },
        signRoot: vi.fn(), signAndShare: vi.fn(),
        order: { step: "idle", error: null, payload: null },
    }),
}));
vi.mock("@/lib/checkout/cartStore", () => ({ useCartStore: () => ({ items: [] }) }));
vi.mock("@/lib/checkout/dispatchRace", () => ({ useDispatchRace: () => ({}), postToAgentEndpoint: vi.fn() }));
vi.mock("@/lib/composition/useCompositionActions", () => ({ useCompositionActions: () => ({ compose: vi.fn() }) }));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false }) }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: undefined }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

describe("CheckoutView — a failed catalog read renders nothing", () => {
    it("no 'Member not found', no 'No member page for 0x…'", () => {
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        expect(container.textContent ?? "").not.toMatch(/Member not found|No member page/);
    });
});
