/**
 * @figaro/core — Assembly identity
 *
 * The AssemblyRegistry keys bindings by `compositionHash`, exactly as the
 * ClauseRegistry keys clauses by `keccak256(abi.encode(name, version))`
 * (`computeClauseKey`). This module is that family's key derivation — pure
 * functions over the template document, no chain access.
 */

import type { Hex } from "./types.js";
import { canonicalContentHash } from "./agreement.js";

/** The assembly's identity — keccak256 of the canonical COMPOSITION subset of
 *  the template (the composed agreements: their clauses, values, and topology;
 *  editorial prose excluded, so renaming never forks identity). This is the
 *  hash `AssemblyRegistry` keys bindings on. Publishers anchor it; readers
 *  recompute it from a fetched document to verify integrity. */
export function templateCompositionHash(template: { agreements: readonly unknown[] }): Hex {
    return canonicalContentHash({ agreements: template.agreements });
}

/** The published slug — presentation only, a deterministic pure function of
 *  the composition hash. Identical compositions → identical slug; distinct
 *  compositions → distinct slug. The slug exists nowhere on-chain: the
 *  registry keys bindings by `compositionHash`, and every reader derives the
 *  slug from the event's hash. */
export function deriveAssemblySlug(compositionHash: Hex): string {
    return `asm-${compositionHash.slice(2, 18)}`;
}
