import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * AUDIT FIX CB-3: Component Testing with Vitest
 * Unit tests for React components
 */

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/e2e/**', // E2E tests run with Playwright
            '**/playwright/**', // Playwright browser tests
            '**/.{idea,git,cache,output,temp}/**',
            // Exclude Solidity, lib, and contract test files
            '../lib/**',
            '../src/**',
            '../archive-v3/**',
            '../archive-v4/**',
            '../prover/**',
            '../test/**',
            '../corpus/**',
            '../crytic-export/**',
            '../formal/**',
            '../broadcast/**',
            '../cache/**',
            '../coverage/**',
            '../scripts/**',
            '../script/**',
            '../states/**',
            // Exclude any .sol, .t.sol, .vy, .yul, .sh, .md, .tla, .cfg, .json, .yaml, .yml, .toml, .lock, .bak, .old, .test.js, .test.cjs, .test.mjs outside frontend
            '../**/*.sol',
            '../**/*.t.sol',
            '../**/*.vy',
            '../**/*.yul',
            '../**/*.sh',
            '../**/*.md',
            '../**/*.tla',
            '../**/*.cfg',
            '../**/*.json',
            '../**/*.yaml',
            '../**/*.yml',
            '../**/*.toml',
            '../**/*.lock',
            '../**/*.bak',
            '../**/*.old',
            '../**/*.test.js',
            '../**/*.test.cjs',
            '../**/*.test.mjs',
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'tests/',
                '**/*.config.*',
                '**/*.d.ts',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
