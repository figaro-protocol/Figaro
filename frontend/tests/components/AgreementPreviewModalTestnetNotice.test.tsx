/**
 * The test-network notice: every commitment signature and commit broadcast
 * passes through the preview modal, and on a test network it says so there,
 * derived from viem's definition of the wallet's chain, by id, and stored
 * nowhere; on the devnet, on mainnet and on a chain viem does not know the
 * notice does not render. Other wallet writes (publishing, registering,
 * rewards, attestations, resolution) do not open this modal and carry no notice.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let chainId = 31337;
vi.mock("wagmi", () => ({ useChainId: () => chainId }));
vi.mock("@/components/runtime/AgreementReview", () => ({ AgreementReview: () => <div data-testid="review-stub" /> }));
vi.mock("@/components/ui/ModalChrome", () => ({
    ModalChrome: ({ children, ...rest }: { children: React.ReactNode; "data-testid"?: string }) => (
        <div data-testid={rest["data-testid"]}>{children}</div>
    ),
}));

import { AgreementPreviewModal } from "@/components/runtime/AgreementPreviewModal";

const COMMITMENT = {} as never;
const modal = (intent: "sign" | "commit") =>
    <AgreementPreviewModal commitment={COMMITMENT} agreement={null} intent={intent} onConfirm={() => {}} onCancel={() => {}} />;

describe("AgreementPreviewModal — the test-network notice", () => {
    beforeEach(() => {
        chainId = 31337;
    });

    it("names the wallet's test network at the moment of signing, from viem's definition of it", () => {
        chainId = 11155111;
        render(modal("sign"));
        const note = screen.getByTestId("preview-testnet-notice");
        expect(note).toHaveTextContent("This is Sepolia, a test network. The commitment you sign here runs on Sepolia, and so do the tokens it locks.");
        expect(note).toHaveAttribute("role", "note");
    });

    it("names any other EVM test network the same way", () => {
        chainId = 80002;
        render(modal("sign"));
        expect(screen.getByTestId("preview-testnet-notice")).toHaveTextContent(/Polygon Amoy, a test network/);
    });

    it("renders no notice on the devnet, on mainnet, or on a chain the registry does not know", () => {
        for (const id of [31337, 1, 424242]) {
            chainId = id;
            const { unmount } = render(modal("commit"));
            expect(screen.queryByTestId("preview-testnet-notice")).toBeNull();
            unmount();
        }
    });
});
