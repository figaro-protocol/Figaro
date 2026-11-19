import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { xmtpNetwork } from "@/lib/data/handoff/xmtpChannel";

describe("xmtpNetwork — the XMTP network is deployment config, never a literal", () => {
    beforeEach(() => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_API_URL", "");
        vi.stubEnv("NEXT_PUBLIC_XMTP_GATEWAY_HOST", "");
    });
    afterEach(() => vi.unstubAllEnvs());

    it("defaults to the public dev network when unset or EMPTY (a devnet .env.local the build reads)", () => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "");
        expect(xmtpNetwork()).toEqual({ env: "dev" });
    });
    it("production for testnet and mainnet builds — the testnet rehearses mainnet's network", () => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "production");
        expect(xmtpNetwork()).toEqual({ env: "production" });
    });
    it("local names its broker: the node's URL, and the gateway's where one is given", () => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "local");
        vi.stubEnv("NEXT_PUBLIC_XMTP_API_URL", " http://localhost:5050 ");
        expect(xmtpNetwork()).toEqual({ env: "local", apiUrl: "http://localhost:5050" });
        vi.stubEnv("NEXT_PUBLIC_XMTP_GATEWAY_HOST", "http://localhost:5152");
        expect(xmtpNetwork()).toEqual({
            env: "local", apiUrl: "http://localhost:5050", gatewayHost: "http://localhost:5152",
        });
    });
    it("refuses local without the node's URL", () => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "local");
        expect(() => xmtpNetwork()).toThrow(/NEXT_PUBLIC_XMTP_API_URL/);
    });
    it("refuses a broker URL beside dev or production, so a hosted network is never redirected", () => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "production");
        vi.stubEnv("NEXT_PUBLIC_XMTP_API_URL", "http://localhost:5050");
        expect(() => xmtpNetwork()).toThrow(/"production" network takes neither/);
        vi.stubEnv("NEXT_PUBLIC_XMTP_API_URL", "");
        vi.stubEnv("NEXT_PUBLIC_XMTP_GATEWAY_HOST", "http://localhost:5152");
        expect(() => xmtpNetwork()).toThrow(/takes neither/);
    });
    it("refuses any other network name instead of sending to the wrong one", () => {
        vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "testnet");
        expect(() => xmtpNetwork()).toThrow(/"dev", "production" or "local"/);
    });
});
