/**
 * OnboardingProfileForm — a failed `symbol()` read on an accepted-token row is
 * no verdict on the address: no "not an ERC-20" line, no "chain RPC
 * unreachable" line, and no "✓" claiming the token is valid. The row shows
 * only what the chain said: nothing.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const TOKEN = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

// The failed read: wagmi's query errored. Its error is whatever the transport
// or the node said — an unreachable RPC, a revert — and neither is a verdict.
const read = vi.hoisted(() => ({ error: new Error("unset") }));
vi.mock("wagmi", () => ({
    useAccount: () => ({ address: ADDRESS, isConnected: true }),
    useChainId: () => 31337,
    useReadContract: () => ({ data: undefined, isLoading: false, isError: true, error: read.error }),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/components/members/IpfsImageUpload", () => ({ IpfsImageUpload: () => null }));
vi.mock("@/lib/member/commonTokens", () => ({ getCommonTokens: () => [] }));
const STATE = {
    profile: {
        name: "Seller",
        acceptedTokens: [{ address: TOKEN, symbol: "" }],
        defaultTokenAddress: TOKEN,
    },
};
vi.mock("@/lib/member/onboardingState", () => ({
    useOnboardingState: () => ({ state: STATE, loaded: true, subject: ADDRESS, update: vi.fn() }),
    onboardingNextHref: () => "/members/next",
}));

import { OnboardingProfileForm } from "@/components/members/OnboardingProfileForm";

describe("OnboardingProfileForm — a failed symbol() read gives no verdict", () => {
    it.each([
        ["an unreachable RPC", "HTTP request failed. connection refused"],
        ["a reverted call", "execution reverted"],
    ])("%s: no 'not an ERC-20', no 'unreachable', no checkmark", (_label, message) => {
        read.error = new Error(message);
        const { container } = render(<OnboardingProfileForm />);
        // The row is rendered: its address input holds the token.
        expect(container.querySelector(`input[value="${TOKEN}"]`)).not.toBeNull();
        const text = container.textContent ?? "";
        expect(text).not.toMatch(/not an ERC-20/i);
        expect(text).not.toMatch(/unreachable/i);
        expect(text).not.toContain("✓");
    });
});
