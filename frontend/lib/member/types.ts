import type { CatalogueItemMetadata, UnitSystem } from "@/lib/member/memberCatalogueMetadata";
import type { AcceptedTokenMetadata } from "@/lib/member/acceptedTokenMetadata";
import type { DisclosurePolicyEntry, MemberAgentServices } from "@/lib/member/memberProfileMetadata";

/**
 * Buyer-side projection of a seller's profile + catalogue.
 *
 * Sources:
 *  - profile (`MemberProfileMetadata`): name, slug, description,
 *    specialty, location (geohash + addressText), branding, accepted
 *    tokens, default token, agent services.
 *  - catalogue (`MemberCatalogueMetadata`): items.
 *
 * Carries no closed-taxonomy fields. Earlier revisions had
 * `cuisine`/`rating`/`deliveryTime`/`minimumOrder` — none of those
 * exist in the underlying clauses; they were rendered from
 * hardcoded defaults and have been removed. `specialty` is the
 * free-form open-string self-description the seller authors
 * themselves.
 */
export interface MemberCatalogue {
    name: string;
    address: string;
    description: string;
    /** Free-form self-description (e.g. "Italian", "Mobile espresso", etc.). Authored by the seller; no closed taxonomy. */
    specialty: string;
    /** Seller logo URI (ipfs:// or https://), when the seller declared a
     *  resolvable one. Absent ⇒ the UI renders a neutral placeholder; never a
     *  coined emoji stand-in. */
    image?: string;
    geohash?: string;
    /** Free-form public street address (optional). */
    addressText?: string;
    items: CatalogueItemMetadata[];
    /** Tokens the seller accepts at settlement. */
    acceptedTokens?: AcceptedTokenMetadata[];
    /** The token catalogue prices are denominated in (one of `acceptedTokens`). */
    defaultTokenAddress?: `0x${string}`;
    /** The seller's PROFILE-authored clause values (seller master data:
     *  dimweight's divisor, a declared credential id), keyed clauseId →
     *  field → value — the checkout folds them onto composed
     *  profile-sourced leaves. */
    profileClauseValues?: Readonly<Record<string, Record<string, unknown>>>;
    /** ERC-8004-compatible service endpoints (optional, for agent-driven sellers). */
    agentServices?: MemberAgentServices;
    /** The member's data-disclosure policy (voluntary data market) —
     *  which co-produced data is offered, to whom, when.
     *  Absent = the paper-contract default: each party holds its own
     *  copy; nothing is offered. */
    disclosurePolicy?: DisclosurePolicyEntry[];
    /** Seller's preferred display unit system for mass / volume. Storage
     *  is always metric; this field only governs UI formatting. */
    unitSystem?: UnitSystem;
}

