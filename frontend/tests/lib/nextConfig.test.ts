// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../../next.config.mjs";

const BUILD = "phase-production-build";

/** A deploy build's env: the XMTP network named, no test opt-in. */
function deployEnv(extra: Record<string, string>) {
    vi.stubEnv("FIGARO_ALLOW_TEST_HELPERS", "");
    vi.stubEnv("NEXT_PUBLIC_XMTP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CHAIN", "");
    vi.stubEnv("NEXT_PUBLIC_IPFS_API_URL", "");
    for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

describe("next.config: a build for a public chain names no IPFS node", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("refuses a Sepolia build that names a node", () => {
        deployEnv({ NEXT_PUBLIC_CHAIN: "sepolia", NEXT_PUBLIC_IPFS_API_URL: "http://127.0.0.1:5001" });
        expect(() => config(BUILD)).toThrow(/NEXT_PUBLIC_IPFS_API_URL/);
    });

    it("refuses a mainnet build that names a remote node", () => {
        deployEnv({ NEXT_PUBLIC_CHAIN: "mainnet", NEXT_PUBLIC_IPFS_API_URL: "https://node.example" });
        expect(() => config(BUILD)).toThrow(/public chain "mainnet"/);
    });

    it("passes a public build that names none", () => {
        deployEnv({ NEXT_PUBLIC_CHAIN: "sepolia" });
        expect(() => config(BUILD)).not.toThrow();
    });

    it("passes the devnet build (chain unset) with its local Kubo", () => {
        deployEnv({ NEXT_PUBLIC_XMTP_ENV: "dev", NEXT_PUBLIC_IPFS_API_URL: "http://127.0.0.1:5001" });
        expect(() => config(BUILD)).not.toThrow();
    });

    it("passes a registry chain whose RPC is the loopback (anvil)", () => {
        deployEnv({ NEXT_PUBLIC_XMTP_ENV: "dev", NEXT_PUBLIC_CHAIN: "anvil", NEXT_PUBLIC_IPFS_API_URL: "http://127.0.0.1:5001" });
        expect(() => config(BUILD)).not.toThrow();
    });

    it("passes the e2e harness's Sepolia build, which opts in with FIGARO_ALLOW_TEST_HELPERS=1", () => {
        deployEnv({ FIGARO_ALLOW_TEST_HELPERS: "1", NEXT_PUBLIC_CHAIN: "sepolia", NEXT_PUBLIC_IPFS_API_URL: "http://127.0.0.1:5001" });
        expect(() => config(BUILD)).not.toThrow();
    });

    it("checks nothing outside the production-build phase", () => {
        deployEnv({ NEXT_PUBLIC_CHAIN: "sepolia", NEXT_PUBLIC_IPFS_API_URL: "http://127.0.0.1:5001" });
        expect(() => config("phase-production-server")).not.toThrow();
    });
});
