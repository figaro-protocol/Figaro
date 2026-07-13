import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage, { metadata } from "@/app/(app)/settings/page";
import { readUserEndpoints } from "@/lib/shared/userEndpoints";
import { readUserTransport } from "@/lib/shared/userTransport";

// Blind-adopter probe run 3, gap G7: the static-export shell for /settings
// must state its subject before hydration (the server page renders the
// heading + prerendered metadata), and the "Endpoints" nav label must match
// the visible page title you land on.
describe("/settings — prerendered shell states its subject", () => {
    it("exports metadata whose title/description name endpoint overrides + coordination transport", () => {
        expect(metadata.title).toBe("Endpoints — Figaro Protocol");
        expect(typeof metadata.description).toBe("string");
        expect(metadata.description).toMatch(/endpoint/i);
        expect(metadata.description).toMatch(/RPC/);
        expect(metadata.description).toMatch(/IPFS/);
        // The coordination-transport opt-in is named alongside the endpoints.
        expect(metadata.description).toMatch(/XMTP|links/i);
    });

    it("renders the 'Endpoints' heading in the server shell (matches the nav label)", () => {
        render(<SettingsPage />);
        expect(
            screen.getByRole("heading", { level: 1, name: "Endpoints" }),
        ).toBeInTheDocument();
    });
});

describe("/settings — the mount-gated form", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("defaults to empty endpoints and the links-only transport floor (optional-field handling)", async () => {
        render(<SettingsPage />);
        // The form mounts behind useMounted; wait for it to appear.
        await screen.findByTestId("settings-rpc-url");
        expect(readUserEndpoints()).toEqual({
            rpcUrl: undefined,
            ipfsApiUrl: undefined,
            ipfsGatewayUrl: undefined,
            geocodeUrl: undefined,
        });
        expect(readUserTransport()).toBe("links-only");
    });

    it("persists a well-formed http(s) endpoint and the XMTP opt-in on Save", async () => {
        const user = userEvent.setup();
        render(<SettingsPage />);
        await user.type(
            await screen.findByTestId("settings-rpc-url"),
            "https://rpc.example.test",
        );
        await user.selectOptions(screen.getByTestId("settings-transport"), "xmtp");
        await user.click(screen.getByTestId("settings-save"));

        await waitFor(() => {
            expect(readUserEndpoints().rpcUrl).toBe("https://rpc.example.test");
        });
        expect(readUserTransport()).toBe("xmtp");
    });

    it("discards a malformed (non-http) endpoint on Save", async () => {
        const user = userEvent.setup();
        render(<SettingsPage />);
        await user.type(
            await screen.findByTestId("settings-ipfs-api-url"),
            "javascript:alert(1)",
        );
        await user.click(screen.getByTestId("settings-save"));

        await screen.findByTestId("settings-saved");
        // The endpoint sanitizer refuses anything that is not an http(s) URL.
        expect(readUserEndpoints().ipfsApiUrl).toBeUndefined();
    });
});
