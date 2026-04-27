/**
 * Groups registry.
 *
 * The group list is anchored to the disciplinary taxonomy in Voshmgir &
 * Zargham, "Foundations of Cryptoeconomic Systems" (2020, Figure 2). Eight
 * disciplines, fixed. Groups form and organize within each discipline; they
 * do not form outside the taxonomy.
 *
 * Group pages are authored by contributors to that group. The site renders
 * what the entry supplies; it does not curate, review, or edit. To amend a
 * group, open a PR against this file.
 */

export interface GroupRegistryEntry {
    /** URL slug. Stable. */
    slug: string;
    /** Zargham's discipline name. */
    name: string;
    /** Short methodological gloss. */
    discipline: string;
    /** One-paragraph framing: what this discipline asks of the Figaro substrate. */
    charter: string;
    /** Where the ongoing conversation happens. */
    venue?: { label: string; href: string };
    /** Current work in progress, as contributors describe it. */
    currentWork?: string[];
    /** Reading path — papers, specs, inventories relevant to the group. */
    readingPath?: { label: string; href: string; note?: string }[];
    /** Grants received (DAO proposals, Gitcoin rounds, direct). */
    grants?: { label: string; href: string; amount?: string }[];
    /** Addresses or handles contributors choose to publish. */
    contributors?: string[];
}

const DEFAULT_VENUE = {
    label: "Open a GitHub discussion",
    href: "https://github.com/figaro-protocol/Figaro-Prototype2/discussions",
};

export const GROUPS_REGISTRY: GroupRegistryEntry[] = [
    {
        slug: "economics-game-theory",
        name: "Economics and Game Theory",
        discipline: "Mechanism design · institutional economics · monetary theory",
        charter: "The kernel rests on a game-theoretic argument: asymmetric bonding with a 2× minimum ratio produces a Nash equilibrium, scales itself from two to N parties through progressive collateralization, and retires the subordination axis of the Coasean firm. This group reads the substrate as economists and game theorists read it — equilibrium analysis, institutional form, monetary design.",
        venue: DEFAULT_VENUE,
        readingPath: [
            { label: "Paper A — Mechanism", href: "/publications#paper-a", note: "asymmetric bonding, Nash, Grameen reduction" },
            { label: "Paper B1 — Institutional economics", href: "/publications#paper-b1", note: "Coase, Williamson, the firm-dissolved" },
            { label: "Paper D — Token design", href: "/publications#paper-d", note: "FIG as Schelling-point, not governance or yield" },
            { label: "Mechanism companion", href: "/mechanism", note: "the game-theoretic derivation in web form" },
            { label: "FIG design companion", href: "/fig/design", note: "token as speech-act identifier" },
        ],
    },
    {
        slug: "industrial-systems-engineering",
        name: "Industrial and Systems Engineering",
        discipline: "System architecture · formal methods · composition",
        charter: "The kernel is a frozen Solidity surface verified across four layers (TLA⁺, Echidna, Halmos, Certora). Above it, assemblies compose declaratively against the schema registry, attestation coordinator, and mechanism primitives. This group reads the substrate as systems engineers — architecture, verification, composition patterns, coordinator-pattern equilibrium preservation.",
        venue: DEFAULT_VENUE,
        readingPath: [
            { label: "Paper C — Implementation", href: "/publications#paper-c", note: "4-layer verification stack, coordinator pattern" },
            { label: "Verification inventory", href: "/verification", note: "every invariant → test → formal layer" },
            { label: "Specifications", href: "/spec", note: "the frozen on-chain surface" },
            { label: "Schemas", href: "/schemas", note: "three-layer validation architecture" },
        ],
    },
    {
        slug: "computer-science-cryptography",
        name: "Computer Science and Cryptography",
        discipline: "Cryptographic primitives · adversarial review · formal verification",
        charter: "Adversarial and formal review of FigaroCore, the attestation coordinator, schema validators, and the batch verifier. EIP-712 dual-signed commitments, merkle-bound attestation receipts, SP1-proven batch execution. This group reads the substrate as cryptographers and systems-security practitioners — where does the invariant break, and what proves that it does not?",
        venue: DEFAULT_VENUE,
        currentWork: [
            "Adversarial audit of the attestation coordinator's merkle-inclusion gate",
            "Extending the Certora token-ops inventory to cover batch-verifier fee-on-transfer paths",
            "TLA⁺ refinement of the progressive-collateralization mesh beyond 3 depth",
        ],
        readingPath: [
            { label: "Verification inventory", href: "/verification", note: "every invariant → test → formal layer" },
            { label: "Freeze notice", href: "https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/FREEZE_NOTICE.md", note: "the surface declared for external audit" },
            { label: "Design decisions", href: "https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/DESIGN_DECISIONS.md", note: "eleven patterns that look like bugs but are correct" },
            { label: "AI audit report", href: "https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/SECURITY_AUDIT_AI.md", note: "zero actionable findings; six informational" },
            { label: "Paper C — Implementation", href: "/publications#paper-c", note: "verification stack + implementation choices" },
        ],
    },
    {
        slug: "philosophy-law-ethics",
        name: "Philosophy, Law and Ethics",
        discipline: "Contract theory · evidence law · labor law · stateless subjecthood",
        charter: "A Figaro commitment is a signed contract: payment = consideration, schemas = terms and conditions, agreementHash = the contract document. Settlement happens on-chain by nature; adjudication happens off-chain by nature. The wallet collapses the Roman res/persona distinction, and the primitive's precondition is a cryptographic key rather than civil-legal subjecthood. This group reads the substrate as lawyers, philosophers, and ethicists read it.",
        venue: DEFAULT_VENUE,
        readingPath: [
            { label: "Paper E — Evidence and law", href: "/publications#paper-e", note: "Class A vs Class B records, admissibility" },
            { label: "Paper F1 — Labor law", href: "/publications#paper-f1", note: "wallet-as-subject, subordination retired" },
            { label: "Paper F2 — Displaced and stateless", href: "/publications#paper-f2", note: "Arendt, capacity-to-have-commerce" },
            { label: "Legal companion", href: "/legal", note: "evidence surfaces for off-chain adjudication" },
            { label: "Labor law companion", href: "/labor-law", note: "web-form treatment of Paper F1" },
            { label: "Displaced companion", href: "/displaced", note: "web-form treatment of Paper F2" },
        ],
    },
    {
        slug: "political-science-governance",
        name: "Political Science and Governance",
        discipline: "Political economy · hegemony · sovereign coordination",
        charter: "The kernel is ideologically agnostic; the graph is the politics. A market-liberal assembly, a cooperative assembly, an Islamic-finance assembly, and a mutual-aid assembly all use the same kernel. This group reads the substrate as political theorists — Gramsci, Arendt, post-hegemony; the question of what governance is when the primitive refuses to take positions.",
        venue: DEFAULT_VENUE,
        readingPath: [
            { label: "Paper B2 — Political economy", href: "/publications#paper-b2", note: "hegemonic propositions, organizational substrate" },
            { label: "Sovereign commerce companion", href: "/sovereign-commerce", note: "web-form treatment of Paper B2" },
        ],
    },
    {
        slug: "operations-research",
        name: "Operations Research and Management Science",
        discipline: "Resource allocation · accounting · ledger design",
        charter: "A Figaro process is a self-closing ledger period. Commits are journal entries; resolution is the closing entry; the agreementHash is the contract document. This group reads the substrate as operations researchers and accountants — the kernel as an accounting primitive, the process tree as a coordination problem, the closure as a scheduling invariant.",
        venue: DEFAULT_VENUE,
        readingPath: [
            { label: "Paper G — Accounting", href: "/publications#paper-g", note: "self-closing ledger period, Pacioli rewritten" },
            { label: "Accounting companion", href: "/accounting", note: "web-form treatment of Paper G" },
            { label: "Treasuries — composition patterns", href: "/treasuries", note: "multisig-as-buyer, governance-executor-as-buyer" },
        ],
    },
    {
        slug: "ai-optimization-control",
        name: "AI, Optimization and Control Theory",
        discipline: "Agent coordination · allocation · control of the mesh",
        charter: "N-party process trees expose a coordination and allocation problem that admits control-theoretic and optimization-theoretic treatment. The SDK ships an action queue and proposer surface for agent-driven composition. This group reads the substrate as control theorists and optimization researchers — what does closed-loop agent coordination look like over the bonded-commitment mesh?",
        venue: DEFAULT_VENUE,
        readingPath: [
            { label: "SDK — agent surface", href: "/integrate", note: "FigaroContext, ActionQueue, proposer" },
            { label: "Paper A — scaling to N parties", href: "/publications#paper-a", note: "progressive collateralization, weakest-link subgame" },
            { label: "Paper C — batch verifier", href: "/publications#paper-c", note: "SP1-proven batch execution" },
        ],
    },
    {
        slug: "psychology-decisions",
        name: "Psychology and Decisions Science",
        discipline: "Behavioral game theory · incentive legibility · interface cognition",
        charter: "The asymmetric-bonding Nash equilibrium assumes strategic agents reading their incentives correctly. In practice, those incentives must be legible through wallets, signing flows, and attestation UX. This group reads the substrate as behavioral economists and decision scientists — when does the equilibrium fail to bind because the player cannot see it?",
        venue: DEFAULT_VENUE,
        readingPath: [
            { label: "Paper A — equilibrium analysis", href: "/publications#paper-a", note: "Nash, iterated elimination, 2× minimum" },
            { label: "Console", href: "/console", note: "supervision and attestation surface" },
            { label: "Figaro Local Commerce runtime", href: "/i/local-commerce", note: "reference implementation of the signing flow" },
        ],
    },
];

export function getGroup(slug: string): GroupRegistryEntry | undefined {
    return GROUPS_REGISTRY.find((g) => g.slug === slug);
}
