import { defineConfig } from "vitest/config";

// The transactor's tests live in src/ alongside the code (policy.test.ts,
// policies/policies.test.ts). Without this config, vitest walks up to
// sdk/vitest.config.ts (include: tests/**) and matches nothing here — so
// `npm test` silently ran zero tests. Point it at src/.
export default defineConfig({
    test: {
        include: ["src/**/*.test.ts"],
    },
});
