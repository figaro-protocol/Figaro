/**
 * The test-network notice: every commitment signature and commit broadcast
 * passes through the preview modal, and on a test network it says so there,
 * derived from the active chain's own `testnet` flag and stored nowhere. On a
 * chain without the flag (the devnet) the notice does not render. Other wallet
 * writes (publishing, registering, rewards, attestations, resolution) do not
 * open this modal and carry no notice.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const chain: { name: string; testnet?: boolean } = { name: "Localhost" };
vi.mock("@/lib/shared/chains", () => ({ get activeChain() { return chain; } }));
vi.mock("@/components/runtime/AgreementReview", () => ({ AgreementReview: () => <div data-testid="review-stub" /> }));
vi.mock("@/components/ui/ModalChrome", () => ({
    ModalChrome: ({ children, ...rest }: { children: React.ReactNode; "data-testid"?: string }) => (
        <div data-testid={rest["data-testid"]}>{children}</div>
    ),
}));

import { AgreementPreviewModal } from "@/components/runtime/AgreementPreviewModal";

const COMMITMENT = {} as never;

describe("AgreementPreviewModal — the test-network notice", () => {
    beforeEach(() => {
        chain.name = "Localhost";
        delete chain.testnet;
    });

    it("names the test network at the moment of signing when the active chain carries the flag", () => {
        chain.name = "Sepolia";
        chain.testnet = true;
        render(<AgreementPreviewModal commitment={COMMITMENT} agreement={null} intent="sign" onConfirm={() => {}} onCancel={() => {}} />);
        const note = screen.getByTestId("preview-testnet-notice");
        expect(note).toHaveTextContent(/Sepolia/);
        expect(note).toHaveTextContent("This is Sepolia, a test network, not Ethereum mainnet. The commitment you sign here runs on Sepolia, and so do the tokens it locks.");
        expect(note).toHaveAttribute("role", "note");
    });

    it("renders no notice on a chain without the flag", () => {
        render(<AgreementPreviewModal commitment={COMMITMENT} agreement={null} intent="commit" onConfirm={() => {}} onCancel={() => {}} />);
        expect(screen.queryByTestId("preview-testnet-notice")).toBeNull();
    });
});
