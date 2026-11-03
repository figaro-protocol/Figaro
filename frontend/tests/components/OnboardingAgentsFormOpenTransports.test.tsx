/**
 * OnboardingAgentsForm — a profile's agent services are an open set of
 * transports. A transport the profile declares beyond the form's hinted ones
 * renders as its own field, and the member can add a transport by name.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
const update = vi.fn();

vi.mock("wagmi", () => ({ useAccount: () => ({ address: ADDRESS, isConnected: true }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const STATE = { services: { mcp: "https://agent.example.com/mcp", nostr: "wss://relay.example.com" } };
vi.mock("@/lib/member/onboardingState", () => ({
    useOnboardingState: () => ({ state: STATE, loaded: true, subject: ADDRESS, update }),
    onboardingNextHref: () => "/next",
    onboardingPrevHref: () => "/prev",
}));

import { OnboardingAgentsForm } from "@/components/members/OnboardingAgentsForm";

describe("OnboardingAgentsForm — every declared transport, none dropped", () => {
    it("renders a field for a transport outside the hinted ones, holding its endpoint", () => {
        render(<OnboardingAgentsForm />);
        expect(screen.getByLabelText("nostr")).toHaveValue("wss://relay.example.com");
        expect(screen.getByLabelText("MCP endpoint")).toHaveValue("https://agent.example.com/mcp");
    });

    it("adds a transport the member names", () => {
        render(<OnboardingAgentsForm />);
        fireEvent.change(screen.getByLabelText("Another transport"), { target: { value: "xmtp" } });
        fireEvent.click(screen.getByRole("button", { name: "Add transport" }));
        fireEvent.change(screen.getByLabelText("xmtp"), { target: { value: "0xabc" } });
        expect(update).toHaveBeenLastCalledWith({
            services: { mcp: "https://agent.example.com/mcp", nostr: "wss://relay.example.com", xmtp: "0xabc" },
        });
    });
});
