/**
 * The site holds no key: every signature and every write is the visitor's own
 * wallet's.
 *
 * Two halves:
 * - In the source the site is built from (`app/`, `components/`, `hooks/`,
 *   `lib/`), one module only turns a private key into an account:
 *   `lib/shared/devShims.ts`, the test signer the end-to-end harness uses.
 * - That test signer attaches nothing in a production build, whatever the
 *   environment carries: no wallet client, no `window.ethereum` override.
 *   `next.config.mjs` refuses to build for production with its flags set; this
 *   is the second wall, in the code itself.
 *
 * Proves: no other module of the site's source makes an account from a key,
 * and the one that does is inert under `NODE_ENV=production`. Does not prove:
 * what a third party's build of the same source does, or what the visitor's
 * wallet does with its own key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { treeSourceFiles } from "./__fixtures__/sourceTree";

const ROOT = path.resolve(process.cwd());
const KEY_TO_ACCOUNT = /\b(privateKeyToAccount|mnemonicToAccount|hdKeyToAccount)\b/;
const THE_TEST_SIGNER = "lib/shared/devShims.ts";

describe("the site's source turns no key into an account", () => {
    it("only the test signer makes an account from a key", () => {
        const holders = treeSourceFiles(ROOT, ["app", "components", "hooks", "lib"])
            .filter((f) => KEY_TO_ACCOUNT.test(readFileSync(f, "utf8")))
            .map((f) => path.relative(ROOT, f).split(path.sep).join("/"));
        expect(holders).toEqual([THE_TEST_SIGNER]);
    });
});

describe("the test signer is inert in a production build", () => {
    const KEY = `0x${"ab".repeat(32)}`;
    const before = { ethereum: window.ethereum, client: window.__viem_wallet_client };

    afterEach(() => {
        vi.unstubAllEnvs();
        window.ethereum = before.ethereum;
        window.__viem_wallet_client = before.client;
    });

    function stubSignerEnv(nodeEnv: string) {
        vi.stubEnv("NODE_ENV", nodeEnv);
        vi.stubEnv("NEXT_PUBLIC_USE_TEST_SIGNER", "1");
        vi.stubEnv("NEXT_PUBLIC_TEST_PRIVATE_KEY", KEY);
        vi.stubEnv("NEXT_PUBLIC_DEV_ADDRESS", "0x70997970c51812dc3a010c7d01b50e0d17dc79c8");
        window.ethereum = undefined;
        window.__viem_wallet_client = undefined;
    }

    it("attaches no wallet client and no provider under NODE_ENV=production, with every flag set", async () => {
        stubSignerEnv("production");
        const { attachTestSigner, attachDevProvider } = await import("@/lib/shared/devShims");
        attachTestSigner();
        attachDevProvider();
        expect(window.__viem_wallet_client).toBeUndefined();
        expect(window.ethereum).toBeUndefined();
    });

    it("the check reads what it claims to: outside production the same flags attach the signer", async () => {
        stubSignerEnv("test");
        const { attachTestSigner } = await import("@/lib/shared/devShims");
        attachTestSigner();
        expect(window.__viem_wallet_client).toBeDefined();
    });
});
