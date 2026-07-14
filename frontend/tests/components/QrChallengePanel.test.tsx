/**
 * QrChallengePanel + interactionSurfaces — the declared-interaction seam,
 * UI half. The registry routes a declared interface to its surface (unknown
 * interfaces route to nothing); the panel presents the order's public
 * identity and verifies a scanned payload locally — match, different-order
 * link, or not-a-payload.
 */
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QrChallengePanel } from "@/components/runtime/QrChallengePanel";
import { getInteractionSurface } from "@/components/runtime/interactionSurfaces";

const PROCESS_ID = "0x" + "11".repeat(32);
const ORDER_HASH = "0x" + "22".repeat(32);
const OTHER_PROCESS = "0x" + "33".repeat(32);
const OTHER_ORDER = "0x" + "44".repeat(32);

afterEach(cleanup);

describe("interactionSurfaces registry", () => {
    it("routes qr-challenge to the panel; a never-seen interface routes to nothing", () => {
        expect(getInteractionSurface("qr-challenge")).toBe(QrChallengePanel);
        expect(getInteractionSurface("holographic-handshake-v9")).toBeNull();
        expect(getInteractionSurface(undefined)).toBeNull();
    });
});

describe("QrChallengePanel", () => {
    const props = {
        processId: PROCESS_ID, orderHash: ORDER_HASH, clauseId: "figaro-handoff",
        buyer: ("0x" + "55".repeat(20)) as `0x${string}`, seller: ("0x" + "66".repeat(20)) as `0x${string}`,
    };

    it("presents the order's public identity (payload + QR image)", async () => {
        render(<QrChallengePanel {...props} />);
        const payload = screen.getByTestId("interaction-qr-payload").textContent!;
        expect(JSON.parse(payload)).toEqual({ processId: PROCESS_ID, orderHash: ORDER_HASH });
        await waitFor(() => {
            const img = screen.getByTestId("interaction-qr-image") as HTMLImageElement;
            expect(img.src.startsWith("data:image/png")).toBe(true);
        });
    });

    it("a scanned payload matching THIS order verifies", async () => {
        render(<QrChallengePanel {...props} />);
        const payload = JSON.stringify({ processId: PROCESS_ID, orderHash: ORDER_HASH });
        await userEvent.click(screen.getByTestId("interaction-qr-scan-input"));
        await userEvent.paste(payload);
        expect(screen.getByTestId("interaction-qr-match")).toBeTruthy();
    });

    it("a payload for a DIFFERENT order links to that order — search by QR", async () => {
        render(<QrChallengePanel {...props} />);
        const payload = JSON.stringify({ processId: OTHER_PROCESS, orderHash: OTHER_ORDER });
        await userEvent.click(screen.getByTestId("interaction-qr-scan-input"));
        await userEvent.paste(payload);
        const link = screen.getByTestId("interaction-qr-goto") as HTMLAnchorElement;
        expect(link.getAttribute("href")).toBe(`/orders/view?process=${OTHER_PROCESS}`);
        expect(screen.queryByTestId("interaction-qr-match")).toBeNull();
    });

    it("garbage input reports not-a-payload", async () => {
        render(<QrChallengePanel {...props} />);
        await userEvent.click(screen.getByTestId("interaction-qr-scan-input"));
        await userEvent.paste("hello");
        expect(screen.getByTestId("interaction-qr-invalid")).toBeTruthy();
    });
});
