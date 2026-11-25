import { defineConfig } from "vitest/config";

/**
 * The SDK's chain-touching files. Each needs a live Anvil (at `ANVIL_URL`, or
 * one it starts itself) and the contracts built into out/; the batch files
 * also need the release relay binary. Each fails at collection, naming what
 * is missing, and never skips. `npm test` excludes them (vitest.config.ts);
 * `npm run test:chain` runs them, and prover-ci's `sp1` job, which starts the
 * Anvil and builds the binary, runs them there.
 */
export const CHAIN_TEST_FILES = [
    "tests/integration.test.ts",
    "tests/batch-e2e.test.ts",
    "tests/batch-revoke-e2e.test.ts",
    "tests/batch-accrual-skip-e2e.test.ts",
    "tests/batch-traces-e2e.test.ts",
];

export default defineConfig({
    test: {
        include: CHAIN_TEST_FILES,
        // The files share one Anvil, and each batch file starts its own relay
        // process: run concurrently they contend for the chain's state and a
        // CI runner's cores. One fork runs one file at a time.
        pool: "forks",
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
});
