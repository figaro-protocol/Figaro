/**
 * PublishTargetNotice — the one line a publishing page shows when this browser
 * has no IPFS node and no pinning service set, with the offer of the setting;
 * nothing once either is set.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublishTargetNotice } from "@/components/shared/PublishTargetNotice";
import { NO_PUBLISH_TARGET_LINE } from "@/lib/shared/ipfsService";

beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_IPFS_API_URL", "");
});
afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.removeItem("figaro.user-endpoints");
});

describe("PublishTargetNotice", () => {
    it("with no node and no service set, says so in one line and offers the setting", () => {
        render(<PublishTargetNotice />);
        const notice = screen.getByTestId("publish-target-notice");
        expect(notice.textContent).toBe(`${NO_PUBLISH_TARGET_LINE} Set one.`);
        expect(screen.getByRole("link", { name: "Set one" }).getAttribute("href")).toBe("/members/edit/endpoints");
    });

    it("with the user's own node set, renders nothing", () => {
        localStorage.setItem("figaro.user-endpoints", JSON.stringify({ ipfsApiUrl: "http://my-node:5001" }));
        const { container } = render(<PublishTargetNotice />);
        expect(container.textContent).toBe("");
    });

    it("with a pinning service and its token set, renders nothing", () => {
        localStorage.setItem(
            "figaro.user-endpoints",
            JSON.stringify({ pinServiceUrl: "https://pins.example.com", pinServiceToken: "user-token" }),
        );
        const { container } = render(<PublishTargetNotice />);
        expect(container.textContent).toBe("");
    });
});
