/**
 * `/members/review` names the registration stake one way wherever it shows.
 * `MembersRegistry.register` is payable and takes `registrationDeposit` in
 * the chain's native token, so the page says the stake is tokens of the
 * chain's native token, read in the decimals the chain declares, and names
 * no ticker. The card shown with no wallet and the publish card shown to an
 * unregistered wallet carry the same words.
 *
 * The same word holds wherever a wallet page names a stake: no source file
 * under `app/(app)`, `app/(tools)` or `components/` calls it an "ETH stake"
 * (the phrase may break across a JSX line, so any run of whitespace between
 * the two words counts).
 */
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { treeSourceFiles } from "../lib/__fixtures__/sourceTree";

const m = vi.hoisted(() => ({ account: { address: undefined as string | undefined, isConnected: false } }));

vi.mock("wagmi", () => ({ useAccount: () => m.account }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
const FILLED = {
    profile: { name: "Seller", defaultTokenAddress: "0x0000000000000000000000000000000000000001" },
    assemblies: [{ processDesignHash: `0x${"ab".repeat(32)}` }],
    catalog: { items: [{ id: "i", name: "Item", description: "", price: "1", available: true }] },
};
vi.mock("@/lib/member/onboardingState", () => ({
    useOnboardingState: () => ({ state: FILLED, clear: vi.fn() }),
    onboardingStepLabel: (s: string) => s,
}));
vi.mock("@/lib/member/useMembersRegistry", () => ({
    useMemberProfile: (address: string | undefined) => (address
        ? { read: { status: "present", value: { registered: false } } }
        : { read: { status: "pending" } }),
    useRegistrationDeposit: () => ({ status: "present", value: 10n ** 16n }),
    useWithdrawalCooldown: () => ({ data: 60n }),
}));
vi.mock("@/lib/member/usePublishMemberProfile", () => ({
    usePublishMemberProfile: () => ({ publish: vi.fn(), isPending: false, isConfirming: false, isSuccess: false, error: null }),
}));
vi.mock("@/components/shared/ContentImage", () => ({ ContentImage: () => null }));

import { OnboardingReview } from "@/components/members/OnboardingReview";

const STAKE_WORDS = /Stake: 0\.01 tokens of the chain’s native token/;

beforeEach(() => {
    m.account = { address: undefined, isConnected: false };
});

describe("/members/review — the registration stake in one wording", () => {
    it("with no wallet, the stake is tokens of the chain's native token", () => {
        const { container } = render(<OnboardingReview />);
        expect(container.textContent).toMatch(STAKE_WORDS);
        expect(container.textContent).not.toMatch(/ETH/);
    });

    it("to an unregistered wallet, the publish card says the same, and names no ticker", () => {
        m.account = { address: "0x00000000000000000000000000000000000000b1", isConnected: true };
        const { container } = render(<OnboardingReview />);
        expect(container.textContent).toMatch(/register\(profileURI\)/);
        expect(container.textContent).toMatch(STAKE_WORDS);
        expect(container.textContent).not.toMatch(/ETH/);
    });
});

describe("the stake is tokens on every wallet page", () => {
    it('no source under app/(app), app/(tools) or components/ says "ETH stake"', () => {
        const root = path.resolve(process.cwd());
        const files = treeSourceFiles(root, ["app/(app)", "app/(tools)", "components"]);
        expect(files.length, "the walk reads source files").toBeGreaterThan(0);
        const hits = files
            .filter((file) => /\bETH\s+stake/i.test(readFileSync(file, "utf8")))
            .map((file) => path.relative(root, file));
        expect(hits).toEqual([]);
    });
});
