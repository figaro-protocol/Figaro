import { configDefaults, defineConfig } from "vitest/config";

import { CHAIN_TEST_FILES } from "./vitest.chain.config.js";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        // The files that need a live chain (and the batch files a built relay
        // binary) are the chain selection's, `npm run test:chain`
        // (vitest.chain.config.ts). `npm test` runs with no chain, so it does
        // not select them. Every file this config selects is a pure-client
        // unit test with no shared external state, so they run in parallel.
        exclude: [...configDefaults.exclude, ...CHAIN_TEST_FILES],
    },
});
