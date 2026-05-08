/**
 * Standard Anvil test accounts (derived from the default Anvil mnemonic).
 *
 * Runner-agnostic: importable from both vitest unit tests (`tests/lib/*`)
 * and playwright e2e specs. `tests/e2e/test-helpers.ts` re-exports
 * `ANVIL_ACCOUNTS` from here so that everything routes to a single
 * declaration.
 *
 *   [0] 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 *   [1] 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
 *   [2] 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
 *   [3] 0x90F79bf6EB2c4f870365E785982E1f101E93b906
 *   [4] 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
 */
export const ANVIL_ACCOUNTS = [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
] as const;

/** Anvil's default mock-token deployment (matches `script/Deploy.s.sol`). */
export const DEFAULT_LOCAL_MOCK_TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
