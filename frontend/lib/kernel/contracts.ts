// Figaro contract configuration — the five core Figaro contracts only
// (kernel + Clause/Seller/Assembly registries + FIG token) plus the agnostic ERC-20.
// Addresses are sourced from environment variables written by deploy-local.sh.
// ABIs are re-exported from the canonical SDK (@figaro/core).
// Any contract the frontend merely COMPOSES with lives in lib/composition/, not here.
//
// NOTE: Next.js/SWC only statically inlines process.env.NEXT_PUBLIC_* with
// dot-notation direct property access. Dynamic bracket access via a function
// parameter (getEnvVar(key)) is NOT replaced and returns undefined in the
// browser. Always use process.env.NEXT_PUBLIC_... directly.

// The frontend imports these from here (the allowlisted core-ABI home). The
// other core ABIs (SELLER_REGISTRY_ABI, FIG_TOKEN_ABI) are equally canonical but
// currently imported straight from `@figaro/core` by their few consumers — they
// re-enter this barrel the moment a frontend surface needs them from here.
export {
    CORE_ABI,
    CLAUSE_REGISTRY_ABI,
    ASSEMBLY_REGISTRY_ABI,
    // Generic ERC-20 standard — the core contracts are ERC-20-agnostic, so the
    // token interface lives here too. Not a Figaro contract.
    ERC20_ABI,
} from "@figaro/core";

export interface ChainConfig {
    /** FigaroCore — the kernel. */
    core: `0x${string}`;
    /** ClauseRegistry. */
    clauseRegistry: `0x${string}`;
    /** SellerRegistry. */
    sellerRegistry: `0x${string}`;
    /** AssemblyRegistry. */
    assemblyRegistry: `0x${string}`;
    /** FIG token — the protocol's own token. */
    figToken: `0x${string}`;
}

export const CONTRACTS: ChainConfig = {
    core: (process.env.NEXT_PUBLIC_FIGARO_CORE || "") as `0x${string}`,
    clauseRegistry: (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY || "") as `0x${string}`,
    sellerRegistry: (process.env.NEXT_PUBLIC_SELLER_REGISTRY || "") as `0x${string}`,
    assemblyRegistry: (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY || "") as `0x${string}`,
    figToken: (process.env.NEXT_PUBLIC_FIG_TOKEN_ADDRESS || "") as `0x${string}`,
};

/** The SellerRegistry address if it's a well-formed address, else null. */
export function getSellerRegistry(): `0x${string}` | null {
    const a = CONTRACTS.sellerRegistry;
    return /^0x[0-9a-fA-F]{40}$/.test(a) ? a : null;
}

// Runtime validation helper.
export function getMissingContractEnv(): string[] {
    const missing: string[] = [];
    if (!process.env.NEXT_PUBLIC_FIGARO_CORE) missing.push("NEXT_PUBLIC_FIGARO_CORE");
    if (!process.env.NEXT_PUBLIC_CLAUSE_REGISTRY) missing.push("NEXT_PUBLIC_CLAUSE_REGISTRY");
    if (!process.env.NEXT_PUBLIC_SELLER_REGISTRY) missing.push("NEXT_PUBLIC_SELLER_REGISTRY");
    if (!process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY) missing.push("NEXT_PUBLIC_ASSEMBLY_REGISTRY");
    return missing;
}
