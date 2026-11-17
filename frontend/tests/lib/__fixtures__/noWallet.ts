/**
 * The page tests' walletless visitor (docs/FRONTEND.md § "Wallet-provider
 * scope per route": the wallet signs, it is never a login).
 */

/** A prompt to connect a wallet, in any of the words the app's pages use. */
export const CONNECT_PROMPT = /connect (a|your) wallet|connect first|wallet to (see|read|view)/i;
