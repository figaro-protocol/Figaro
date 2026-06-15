/**
 * acceptedTokenMetadata.ts — the tokens a seller accepts for settlement.
 *
 * A seller-identity / value-surface concern: token acceptance IS identity —
 * the set of tokens a seller bonds in defines their coordination surface and
 * value system. Distinct from the catalogue (the seller's items); kept in its
 * own file so it never leaks into catalogue types.
 */
export interface AcceptedTokenMetadata {
    /** ERC-20 contract address. */
    address: `0x${string}`;
    /** Token symbol, e.g. "USDC", "FIG". */
    symbol: string;
    /** Human-readable name. */
    name?: string;
    /** URI (IPFS or HTTP) to the token logo. */
    logoURI?: string;
}
