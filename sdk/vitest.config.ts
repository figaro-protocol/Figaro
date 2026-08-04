import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        // `tests/integration.test.ts` and `tests/batch-e2e.test.ts` are both
        // SKIP_ANVIL-gated chain-touching suites that share ONE live Anvil
        // instance (batch-e2e additionally spawns a live sequencer process);
        // run concurrently they contend for the same chain/sequencer state
        // and go flaky — green in isolation, red together. Every other test
        // file is a pure-client unit test with no shared external state, so
        // only these two need serializing against each other.
        //
        // Default pool stays "threads" (the normal parallel pool) for the
        // rest of the suite; `poolMatchGlobs` routes just these two files
        // into a separate "forks" pool restricted to a single fork
        // (`poolOptions.forks.singleFork`), so within that pool only one of
        // the two ever runs at a time while everything else still
        // parallelizes normally.
        pool: "threads",
        poolMatchGlobs: [
            ["tests/integration.test.ts", "forks"],
            ["tests/batch-e2e.test.ts", "forks"],
        ],
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
    },
});
