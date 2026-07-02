/**
 * lib/seller/commonTokens.ts
 *
 * Per-chain registry of well-known ERC-20 tokens to surface as quick-add
 * suggestions in seller-side forms (e.g. the onboarding wizard's
 * accepted-tokens field). Replaces the bare-address input with a
 * "+ USDC" / "+ USDT" / "+ Mock" picker.
 *
 * Devnet (chainId 31337) reads the project-deployed mock tokens from env
 * vars. No chain carries a hardcoded roster (a baked-in token list is
 * closed-world drift): on chains without an env-driven entry the form is
 * manual input only, and any pasted token's symbol/decimals are read from
 * the chain itself.
 */

import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { DEVNET_CHAIN_ID } from "@/lib/shared/chains";
import { isValidAddress } from "@/lib/shared/evm";
import type { AcceptedTokenMetadata } from "@/lib/seller/acceptedTokenMetadata";

/** A quick-add token suggestion — the identity subset of the seller's
 *  accepted-token descriptor (one type for the concept, not two). */
export type CommonToken = Pick<AcceptedTokenMetadata, "address" | "symbol" | "name">;

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
    if (!trimmed || trimmed === ZERO_ADDRESS) return undefined;
    if (!isValidAddress(trimmed)) return undefined;
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
 * Per-chain suggestions, all env-driven. Missing chains return an empty
 * array (the form falls back to manual input only).
 */
const CHAIN_TOKENS: Record<number, () => CommonToken[]> = {
    // Local Anvil — env-driven mocks.
    [DEVNET_CHAIN_ID]: localTokens,
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
