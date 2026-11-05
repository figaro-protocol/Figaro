/**
 * OnboardingEndpointsForm — the member's own endpoints, stored in this
 * browser only: before mount the wizard's shared loading card; mounted, a
 * save writes the fields over what this browser holds and, in the wizard,
 * advances to the next step.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({
    mounted: true,
    push: (() => {}) as (href: string) => void,
    stored: {} as Record<string, string>,
    written: [] as Record<string, string>[],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (href: string) => m.push(href) }) }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => m.mounted }));
vi.mock("@/lib/shared/userEndpoints", () => ({
    readUserEndpoints: () => m.stored,
    writeUserEndpoints: (next: Record<string, string>) => { m.written.push(next); },
}));

import { OnboardingEndpointsForm } from "@/components/members/OnboardingEndpointsForm";

beforeEach(() => {
    m.mounted = true;
    m.push = vi.fn();
    m.stored = { rpcUrl: "http://old-rpc", customKey: "kept" };
    m.written = [];
});

describe("OnboardingEndpointsForm", () => {
    it("before mount, shows the shared loading card and nothing else", () => {
        m.mounted = false;
        const { container } = render(<OnboardingEndpointsForm nextHref="/members/next" />);
        expect(container.textContent).toBe("Loading…");
    });

    it("saves the fields over what this browser holds and advances in the wizard", () => {
        render(<OnboardingEndpointsForm nextHref="/members/next" />);
        expect((screen.getByTestId("endpoints-rpcUrl") as HTMLInputElement).value).toBe("http://old-rpc");
        fireEvent.change(screen.getByTestId("endpoints-rpcUrl"), { target: { value: "http://my-rpc" } });
        fireEvent.click(screen.getByTestId("endpoints-save"));
        expect(m.written).toEqual([{
            customKey: "kept", rpcUrl: "http://my-rpc", ipfsApiUrl: "", ipfsGatewayUrl: "", analystUrl: "", analystToken: "",
        }]);
        expect(m.push).toHaveBeenCalledWith("/members/next");
    });

    it("in place (no next step), saves and says so without navigating", () => {
        render(<OnboardingEndpointsForm />);
        fireEvent.click(screen.getByTestId("endpoints-save"));
        expect(m.written).toHaveLength(1);
        expect(m.push).not.toHaveBeenCalled();
        expect(screen.getByTestId("endpoints-saved").textContent).toBe("Saved.");
    });
});
