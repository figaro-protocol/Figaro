/**
 * Recourse-forum integrations — composition (the fifth noun).
 *
 * A dispute-resolution clause names a forum; SOME forums ship their own
 * on-network dispute UI we can deep-link a party into with the audit evidence.
 * Kleros's Dispute Resolver (resolve.kleros.io) is one such forum.
 *
 * This is the ONLY place a specific forum is named. Recourse READING
 * (`resolveProcessRecourse`) is clause-agnostic — it surfaces ANY
 * dispute-resolution clause generically from its spec. A clause with no
 * integration here still surfaces and its evidence bundle still downloads; it
 * simply has no deep-link. Add a case when another ADR provider integrates its
 * UI — additive composition, no change to the open-world resolver.
 */

/** The forum's own dispute UI for a dispute-resolution clause, if one integrates. */
export function recourseForumUrl(clauseId: string): string | undefined {
    switch (clauseId) {
        case "figaro-arbitration-kleros":
            return "https://resolve.kleros.io";
        default:
            return undefined;
    }
}
