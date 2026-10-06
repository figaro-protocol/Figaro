import type { CatalogItemMetadata, UnitSystem } from "@/lib/member/memberCatalogMetadata";
import type { AcceptedTokenMetadata } from "@/lib/member/acceptedTokenMetadata";
import type { DisclosurePolicyEntry, MemberAgentServices } from "@/lib/member/memberProfileMetadata";

/**
 * Buyer-side projection of a member's profile + catalog.
 *
 * Sources:
 *  - profile (`MemberProfileMetadata`): name, slug, description,
 *    specialty, location (geohash + addressText), branding, accepted
 *    tokens, default token, agent services.
 *  - catalog (`MemberCatalogMetadata`): items.
 *
 * Carries no closed-taxonomy fields. A field like `cuisine`, `rating`,
 * `deliveryTime`, or `minimumOrder` has no home here — none of those exist in
 * the underlying clauses, so adding one back means rendering from a hardcoded
 * default rather than from clause data. `specialty` is the free-form
 * open-string self-description the member authors themselves.
 */
export interface MemberCatalog {
    name: string;
    address: string;
    description: string;
    /** Free-form self-description (e.g. "Italian", "Mobile espresso", etc.). Authored by the member; no closed taxonomy. */
    specialty: string;
    /** Member logo URI (ipfs:// or https://), when the member declared a
     *  resolvable one. Absent ⇒ the UI renders a neutral placeholder; never a
     *  coined emoji stand-in. */
    image?: string;
    geohash?: string;
    /** Free-form public street address (optional). */
    addressText?: string;
    items: CatalogItemMetadata[];
    /** Tokens the member accepts at resolution. */
    acceptedTokens?: AcceptedTokenMetadata[];
    /** The token catalog prices are denominated in (one of `acceptedTokens`). */
    defaultTokenAddress?: `0x${string}`;
    /** The member's PROFILE-authored clause values (member master data:
     *  dimweight's divisor, a declared credential id), keyed clauseId →
     *  field → value — the checkout folds them onto composed
     *  profile-sourced leaves. */
    profileClauseValues?: Readonly<Record<string, Record<string, unknown>>>;
    /** ERC-8004-compatible service endpoints (optional, for agent-driven members). */
    agentServices?: MemberAgentServices;
    /** The member's data-disclosure policy (voluntary data market) —
     *  which co-produced data is offered, to whom, when.
     *  Absent = the paper-contract default: each party holds its own
     *  copy; nothing is offered. */
    disclosurePolicy?: DisclosurePolicyEntry[];
    /** Member's preferred display unit system for mass / volume. Storage
     *  is always metric; this field only governs UI formatting. */
    unitSystem?: UnitSystem;
}

