/**
 * lib/shared/commonTokens.ts
 *
 * Per-chain registry of well-known ERC-20 tokens to surface as quick-add
 * suggestions in operator-side forms (e.g. the onboarding wizard's
 * accepted-tokens field). Replaces the bare-address input with a
 * "+ USDC" / "+ USDT" / "+ Mock" picker.
 *
 * Devnet (chainId 31337) reads the project-deployed mock tokens from
 * env vars; production chains carry hardcoded canonical addresses.
 */

export interface CommonToken {
    address: `0x${string}`;
    symbol: string;
    name: string;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Validates a literal env-var string and narrows it to a 0x address.
 * Direct (literal) `process.env.FOO` access is required for Next.js
 * to inline the value on the client at build time — `process.env[key]`
 * (dynamic access) leaves the lookup as `undefined` in the browser
 * bundle and silently drops every token. The call sites below MUST
 * stay as direct property reads, not a dynamic helper.
 */
function normalizeAddress(value: string | undefined): `0x${string}` | undefined {
    const trimmed = (value ?? "").trim();
    if (!trimmed || trimmed === ZERO) return undefined;
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return undefined;
    return trimmed as `0x${string}`;
}

const localTokens: () => CommonToken[] = () => {
    const out: CommonToken[] = [];
    const mock = normalizeAddress(process.env.NEXT_PUBLIC_TOKEN_ADDRESS);
    if (mock) out.push({ address: mock, symbol: "MOCK", name: "Mock ERC-20 (devnet)" });
    const permit = normalizeAddress(process.env.NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS);
    if (permit) out.push({ address: permit, symbol: "MOCKP", name: "Mock Permit token (devnet)" });
    const fig = normalizeAddress(process.env.NEXT_PUBLIC_FIG_TOKEN_ADDRESS);
    if (fig) out.push({ address: fig, symbol: "FIG", name: "Figaro" });
    return out;
};

/**
 * Per-chain canonical addresses. Update as chains are added; missing
 * chains return an empty array (the form falls back to manual input
 * only).
 */
const CHAIN_TOKENS: Record<number, () => CommonToken[]> = {
    // Local Anvil — env-driven mocks.
    31337: localTokens,

    // Base Sepolia (testnet)
    84532: () => [
        { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", symbol: "USDC", name: "USD Coin (testnet)" },
    ],

    // Ethereum mainnet
    1: () => [
        { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin" },
        { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD" },
        { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai Stablecoin" },
    ],

    // Base mainnet
    8453: () => [
        { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", name: "USD Coin" },
    ],

    // Optimism
    10: () => [
        { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", name: "USD Coin" },
        { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", symbol: "USDT", name: "Tether USD" },
    ],

    // Arbitrum One
    42161: () => [
        { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", name: "USD Coin" },
        { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", name: "Tether USD" },
    ],
};

/**
 * Common-token suggestions for a given chain. Returns an empty array
 * when the chain has no entry; the caller should fall back to manual
 * input only.
 */
export function getCommonTokens(chainId: number): CommonToken[] {
    const factory = CHAIN_TOKENS[chainId];
    return factory ? factory() : [];
}
