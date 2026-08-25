import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const clausesMock = vi.fn();
const assembliesMock = vi.fn();
const membersMock = vi.fn();
vi.mock("@/lib/protocol/useClauseRegistry", () => ({ useAllRegisteredClauses: () => clausesMock() }));
vi.mock("@/lib/protocol/useAssemblyRegistry", () => ({ usePublishedAssemblies: () => assembliesMock() }));
vi.mock("@/lib/member/useRegisteredMembers", () => ({ useRegisteredMembers: () => membersMock() }));
vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { RegistryCountLink } from "@/components/registries/RegistryCountLink";

const clause = (stakeWithdrawn = false) => ({ clauseId: "figaro-probe", version: 1, stakeWithdrawn });
const member = (stakeWithdrawn = false) => ({ address: "0xA", stakeWithdrawn });

const SDK_README = "https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md";

describe("RegistryCountLink — one component owns the registry scaffolding all three families shared", () => {
    beforeEach(() => {
        clausesMock.mockReturnValue({ data: [clause(), clause(), clause(true)] });
        assembliesMock.mockReturnValue({ data: [{ compositionHash: "0x1" }] });
        membersMock.mockReturnValue({ data: [member(), member(true)] });
    });

    it("clauses: derives the count off live registrations, and its scaffolding names ClauseRegistry / ClauseRegistered", () => {
        render(<RegistryCountLink family="clauses" />);
        // stake-withdrawn registrations are de-surfaced, so 3 events → 2 counted.
        expect(screen.getByTestId("registry-count-clauses").textContent).toContain("2 clauses are registered");
        const body = document.body.textContent ?? "";
        expect(body).toContain("There is no static roster of clauses");
        expect(body).toContain("derived, never stored");
        expect(body).toContain("ClauseRegistry");
        expect(body).toContain("ClauseRegistered");
        expect(body).toContain("reconstructDiscovery()");
    });

    it("the agent read path points at the SDK README on every family that carries it — never at /spec (the drift this fold closed)", () => {
        for (const family of ["clauses", "assemblies"] as const) {
            const { unmount } = render(<RegistryCountLink family={family} />);
            const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
            expect(hrefs).toContain(SDK_README);
            expect(hrefs).not.toContain("/spec");
            expect(hrefs).toContain(`/registries?family=${family}`);
            unmount();
        }
    });

    it("assemblies: the same template, its own registry and its own repository directory", () => {
        render(<RegistryCountLink family="assemblies" />);
        expect(screen.getByTestId("registry-count-assemblies").textContent).toContain("1 assembly is registered");
        const body = document.body.textContent ?? "";
        expect(body).toContain("There is no static roster of assemblies");
        expect(body).toContain("AssemblyRegistered");
        expect(body).not.toContain("ClauseRegistry");
        const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
        expect(hrefs).toContain("https://github.com/figaro-protocol/Figaro/tree/main/assemblies");
    });

    it("members: the count line alone — /members is a one-subject page and carries no scaffolding", () => {
        render(<RegistryCountLink family="members" />);
        expect(screen.getByTestId("registry-count-members").textContent).toContain("1 member is registered");
        const body = document.body.textContent ?? "";
        expect(body).not.toContain("static roster");
        expect(body).not.toContain("reconstructDiscovery()");
        expect(document.querySelectorAll("a")).toHaveLength(1);
    });

    it("an unresolved registry read renders the reading state, never a fabricated zero", () => {
        clausesMock.mockReturnValue({ data: null });
        render(<RegistryCountLink family="clauses" />);
        const line = screen.getByTestId("registry-count-clauses").textContent ?? "";
        expect(line).toContain("Reading the registry");
        expect(line).not.toContain("0 clauses");
        // The scaffolding is a fact about the registry, not about the read — it still renders.
        expect(document.body.textContent).toContain("There is no static roster of clauses");
    });
});
