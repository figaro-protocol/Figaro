/**
 * The Verify link to an outside register is read through the mark a clause's
 * spec declares (`block.checkout.registerLink`), never through the names of
 * its fields (CLAUDE.md § "The clause's seams", 5). A stranger's clause that
 * declares the mark gets the link under its own field names; the reference
 * clause with its mark gets it; a clause with fields of the reference's names
 * and no mark gets none; a mark the spec's own fields contradict marks nothing.
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CredentialVerifyButton } from "@/components/runtime/CredentialVerifyButton";
import { _resetClauseSpecCache_TESTING_ONLY, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { keyOf, pinSpec, primeClauseSpecs } from "../lib/primeClauseSpecs";

afterEach(() => {
    cleanup();
    _resetClauseSpecCache_TESTING_ONLY();
});

async function serveSpec(spec: Record<string, unknown>): Promise<string> {
    const pinned = pinSpec(spec);
    setClauseSpecFetcher(async () => pinned.bytes);
    await loadClauseSpec(pinned.clauseKey, `mem://${String(spec.clauseId)}`);
    return pinned.clauseKey;
}

const spec = (clauseId: string, fields: Record<string, unknown>[], checkout: Record<string, unknown> = {}) => ({
    clauseId, version: 1, title: clauseId, description: "A clause of the test's own.",
    fields: fields.map((f) => ({ type: "string", required: true, ...f })),
    stages: {},
    block: { design: { article: "credential" }, checkout },
});

const link = () => screen.queryByTestId("credential-verify");

describe("CredentialVerifyButton reads the register-link mark", () => {
    it("a stranger's clause that marks its own URI and id gets the link", async () => {
        const key = await serveSpec(spec("stranger-badge",
            [{ name: "lookupUrl", format: "uri-template" }, { name: "badgeNo" }],
            { registerLink: { uri: "lookupUrl", id: "badgeNo" } }));
        render(<CredentialVerifyButton clauseKey={key} data={{ lookupUrl: "https://board.example/r/{id}", badgeNo: "B 7" }} />);
        expect(link()?.getAttribute("href")).toBe("https://board.example/r/B%207");
    });

    it("the reference clause, with its mark, gets the link", async () => {
        await primeClauseSpecs(["figaro-credential"]);
        render(<CredentialVerifyButton
            clauseKey={keyOf("figaro-credential")}
            data={{ credentialRegisterUri: "https://register.example/lookup?entry={id}", credentialId: "LIC-500458" }}
        />);
        expect(link()?.getAttribute("href")).toBe("https://register.example/lookup?entry=LIC-500458");
    });

    it("a clause with fields of the reference's names and no mark gets no link", async () => {
        const key = await serveSpec(spec("unmarked-badge",
            [{ name: "credentialRegisterUri", format: "uri-template" }, { name: "credentialId" }]));
        render(<CredentialVerifyButton
            clauseKey={key}
            data={{ credentialRegisterUri: "https://register.example/lookup?entry={id}", credentialId: "LIC-500458" }}
        />);
        expect(link()).toBeNull();
    });

    it("a mark the spec's own fields contradict marks nothing", async () => {
        // The URI field is not of format uri-template.
        const key = await serveSpec(spec("contradicted-badge",
            [{ name: "lookupUrl" }, { name: "badgeNo" }],
            { registerLink: { uri: "lookupUrl", id: "badgeNo" } }));
        render(<CredentialVerifyButton clauseKey={key} data={{ lookupUrl: "https://board.example/r/{id}", badgeNo: "B7" }} />);
        expect(link()).toBeNull();
    });
});
