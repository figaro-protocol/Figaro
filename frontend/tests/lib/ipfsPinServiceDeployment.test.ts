/**
 * The site's pin-service token serves the build's own deployment only.
 *
 * The token is the testnet courtesy (`next.config.mjs` refuses it in a build
 * for any chain but Sepolia). One site now shows every deployment its build
 * lists, so a page showing another deployment than the build's own must not
 * pin through the site's account: on a public mainnet each party pins what
 * it publishes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/shared/chains", async (original) => ({
    ...(await original<typeof import("@/lib/shared/chains")>()),
    pageDeployment: { kind: "published", record: { chainId: 1, figaroCore: `0x${"11".repeat(20)}` } },
}));

import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";

describe("the site's pin service on a page showing another deployment than the build's own", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("is not used: the publish goes to the reader's node, never the pinning account", async () => {
        vi.stubEnv("NEXT_PUBLIC_IPFS_PIN_SERVICE_JWT", "test-jwt");
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: "OK",
            json: async () => ({ Hash: "QmNode11111111111111111111111111111111111111111" }),
            text: async () => JSON.stringify({ Hash: "QmNode11111111111111111111111111111111111111111" }),
        });
        globalThis.fetch = fetchMock;

        await DEFAULT_IPFS_SERVICE.publishJSON({ hello: "world" });

        for (const [url, init] of fetchMock.mock.calls) {
            expect(String(url)).not.toContain("pinata");
            expect(JSON.stringify((init as RequestInit | undefined)?.headers ?? {})).not.toContain("test-jwt");
        }
        expect(fetchMock).toHaveBeenCalled();
    });
});
