import { afterEach, describe, expect, it, vi } from "vitest";
import { xmtpNetworkEnv } from "@/lib/handoff/xmtpChannel";

describe("xmtpNetworkEnv — the XMTP network is deployment config, never a literal", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("defaults to the public dev network when unset or EMPTY (a devnet .env.local read by next build)", () => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "");
        expect(xmtpNetworkEnv()).toBe("dev");
    });
    it("production for mainnet builds", () => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "production");
        expect(xmtpNetworkEnv()).toBe("production");
    });
    it("refuses any other network name instead of sending to the wrong one", () => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "local");
        expect(() => xmtpNetworkEnv()).toThrow(/dev.*production/);
    });
});
