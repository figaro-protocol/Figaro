/** 1–8 — Voshmgir & Zargham's eight disciplines. */
type DisciplineIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Disciplinary grouping ("registry" was a tier-word homograph; the on-chain registries are the protocol anchors) — Voshmgir & Zargham, "Foundations of Cryptoeconomic
 * Systems" (Working Paper Series 1/2020, Research Institute for Cryptoeconomics,
 * WU Vienna, 2020; §3 + Fig. 2 — the paper:
 * https://research.wu.ac.at/en/publications/foundations-of-cryptoeconomic-systems-6/).
 * Eight disciplines, VERBATIM from the paper's list. Each discipline is a
 * stable lens for reading the substrate; the list cannot grow or shrink
 * without departing from the taxonomy.
 *
 * Papers, `currentWork`, `grants`, and `venue` are all optional. Every
 * discipline always has a definition; `/working-groups` renders the
 * discipline map (the `#<slug>` anchors live there). The asymmetry surfaces
 * where the project actually is.
 *
 * Per-group `venue` overrides surface a dedicated channel when a
 * discipline has one. There is no project-wide coordination channel,
 * official or otherwise — one would contradict permissionless formation;
 * PRs against this file are the canonical contribution path.
 *
 * To amend an entry, open a PR against this file. PRs are reviewed at
 * merge time like any other; the group shape is the contract, not
 * the merge process.
 */

interface PaperRef {
    /** Full title. */
    title: string;
    /** Page route (`/papers/<slug>`) for a migrated paper, or path to the
     *  PDF (`/papers/<name>.pdf`) for one still authored in LaTeX. */
    href: string;
    /** One-line description surfaced in the listing, derived from the paper's
     *  own abstract. Adds no claim the paper does not already make. */
    /** Marks the formal/engineering-core papers (mechanism-design proof,
     *  verified kernel, composition discipline, behavioral game theory) apart
     *  from the interpretive essays. Rendered as a lightweight tag. */
    formalCore?: boolean;
}

interface ReferenceLink {
    label: string;
    href: string;
    note?: string;
}

export interface PaperGroup {
    /** URL slug (stable). Used for `#<slug>`-style anchors on /working-groups. */
    slug: string;
    /** 1–8 — stable ordinal within the taxonomy (display only; the URL anchor is driven by `slug`). */
    disciplineIndex: DisciplineIndex;
    /** Zargham's discipline name. */
    name: string;
    /** Short methodological gloss (subdiscipline). */
    discipline: string;
    /** One-paragraph introduction of the discipline, derived from the
     *  Voshmgir & Zargham paper (sourced once, via the page footnote). */
    intro: string;
    /** The project-specific paragraph: what this group reads in Figaro. */
    definition: string;
    /** Papers primarily assigned to this discipline. Empty array means
     *  the discipline is an open call — no canonical work convened yet. */
    papers: PaperRef[];
    /** Cross-references to other internal surfaces (specs, runtime,
     *  cross-discipline papers). Optional. */
    references?: ReferenceLink[];
    /** Current work in progress, as contributors describe it. */
    currentWork?: string[];
    /** Where the conversation happens — only when the group has its OWN
     *  dedicated channel. No project-wide channel exists to inherit;
     *  undefined means the group has not published one. */
    venue?: { label: string; href: string };
    /** Grants received (DAO proposals, direct contributions). */
    grants?: { label: string; href: string; amount?: string }[];
    /** Addresses or handles contributors choose to publish. */
    contributors?: string[];
}

export const PAPER_GROUPS: PaperGroup[] = [
    {
        slug: "economics-game-theory",
        disciplineIndex: 1,
        name: "Economics and Game Theory",
        discipline: "Mechanism design · market design · institutional economics · monetary theory",
        intro: "The micro-foundations: mechanism design as reverse game theory — constructing the game so that the desired behavior is what self-interested actors converge on — tempered by the evolution-of-cooperation result that cooperation among selfish actors is a sufficient condition, not a necessary one, so richer theories of human behavior belong here too.",
        definition: "What a market can be built out of, once the standing firm is no longer the uniquely efficient unit of production: the subordination axis of the Coasean firm becomes structurally optional, and the Coasean transaction-cost threshold shifts inward, within the domain the primitive covers. That result rests on a game-theoretic argument — the doubled bonding schedule (the buyer twice the payment, each seller twice the value the chain has accumulated through its own link) produces a Nash equilibrium, subgame-perfect at the bilateral edge, and carries it from two parties to N because every seller's bond is keyed to that accumulator. This group reads the substrate as economists and game theorists read it — equilibrium analysis, institutional form, market formation, monetary design.",
        papers: [
            { title: "Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination", href: "/papers/asymmetric-bonding", formalCore: true },
            { title: "Markets Without a Venue: Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Settlement Layer", href: "/papers/markets-without-a-venue", formalCore: true },
            { title: "From Firms to Transaction-Scoped Institutions: A Coasean Re-Examination", href: "/papers/transaction-scoped-institutions" },
            { title: "The Florin: A Schelling-Point Token for the Figaro Coordination Ecosystem", href: "/papers/florin-schelling-point-token" },
            { title: "Self-Authenticating Data Sales: Dissolving Arrow's Information Paradox Through Bonded Settlement", href: "/papers/self-authenticating-data-sales" },
        ],
        references: [
            { label: "Protocol — two mechanisms", href: "/kernel", note: "two-mechanism + contract-law overview" },
            { label: "RPGF", href: "/rpgf", note: "the reward formula for clause authors AND assembly designers" },
        ],
    },
    {
        slug: "industrial-systems-engineering",
        disciplineIndex: 2,
        name: "Industrial and Systems Engineering",
        discipline: "Process modeling · supply-chain coordination",
        intro: "The system as a designed whole: complex adaptive networks whose collective behavior cannot be inferred from individual actions, and resilient protocol design that accounts for the network's spatial and temporal dynamics.",
        definition: "How bonded commitments compose into multi-party processes with auditable handoffs, lifecycle attestation, and proximity proof. Two worked examples: air service as coordinated resource markets (cascading-delay loss absorbed as a by-product of unit-level bonded commitments rather than as their aim) and permissionless container shipping (an ownerless successor to the failed TradeLens consortium).",
        papers: [
            { title: "Air Service as Coordinated Resource Markets", href: "/papers/air-service-coordination" },
            { title: "After TradeLens: A Permissionless Bonded Replacement", href: "/papers/after-tradelens" },
        ],
    },
    {
        slug: "computer-science-cryptography",
        disciplineIndex: 3,
        name: "Computer Science and Cryptography",
        discipline: "Cryptographic primitives · adversarial review · formal verification · protocol composition · runtime architecture",
        intro: "Economic policies embedded in software: protocol and smart-contract code as the rule layer, cryptographic tools combined with economic incentives so that the cost of wrongdoing is disproportionate to its benefit.",
        definition: "Two complementary lenses on the protocol's CS surface — and the surfaces the implementation work organizes on: clause authoring, contract development, assembly composition, and frontend all run on Clauses and Assemblies. Protocol composition reads what stands above the kernel as a research object: the composition doctrine (anchored-reference pattern, append-only identity, first-write-wins binding), clause design as a CS discipline (canonical specification, content-addressed registration, and the merkle-binding that makes a registered clause attestable with no per-clause on-chain code), and the coordinator pattern with formal composition semantics and equilibrium-preservation conditions discharged on worked composers. The verified settlement kernel reads the kernel adversarially: where does the invariant break, and what proves that it does not? EIP-712 dual-signed commitments, the attestation surface, the formal-verification stack, and the boundary between the direct settlement path and the proof-batched one.",
        papers: [
            { title: "A Verified Settlement Kernel: Formal Verification, Threat Model, and the Scope of the Claim", href: "/papers/verified-settlement-kernel", formalCore: true },
            { title: "Protocol Composition: A Decision Rule, Clause Design, and the Coordinator Pattern", href: "/papers/protocol-composition", formalCore: true },
        ],
        references: [
            { label: "Specifications", href: "/spec", note: "the frozen on-chain surface" },
            { label: "Release readiness + freeze notice", href: "https://github.com/figaro-protocol/Figaro/blob/main/docs/RELEASE_READINESS.md" },
            { label: "Design decisions", href: "https://github.com/figaro-protocol/Figaro/blob/main/docs/DESIGN_DECISIONS.md", note: "the patterns that look like bugs but are correct by design" },
            { label: "Clauses", href: "/clauses", note: "implementation work — clauses, contracts, assemblies, frontend" },
        ],
    },
    {
        slug: "philosophy-law-ethics",
        disciplineIndex: 4,
        name: "Philosophy, Law and Ethics",
        discipline: "Contract theory · evidence law · labor law · stateless subjecthood · political philosophy",
        intro: "The normative layer: any choice of coordination objective is a subjective choice, so whose values a system encodes, the accountability of its designers, and the ethics of decision algorithms in social systems come before the engineering.",
        definition: "A Figaro commitment is a signed contract: payment = consideration, clauses = terms and conditions, agreementHash = the contract document. Settlement happens on-chain by nature; adjudication happens off-chain by nature. The wallet collapses the Roman res/persona distinction, and the primitive's precondition is a cryptographic key rather than civil-legal subjecthood. The platform is not a fact of nature; it is a contingent answer to a coordination problem the bonded primitive answers differently. This group reads the substrate as lawyers, philosophers, and ethicists read it.",
        papers: [
            { title: "On-Chain Evidence, Off-Chain Adjudication", href: "/papers/on-chain-evidence" },
            { title: "The Wallet as Legal Subject", href: "/papers/wallet-legal-subject" },
            { title: "Coercion as a Substrate Variable", href: "/papers/coercion-variable" },
            { title: "The Disclosure Asymmetry: Cryptoeconomic Mechanism Design and the Engineering of Consent", href: "/papers/the-disclosure-asymmetry" },
            { title: "Code Is Constitution: The Entrenched Layer Beneath Enactment", href: "/papers/code-is-constitution" },
        ],
    },
    {
        slug: "political-science-governance",
        disciplineIndex: 5,
        name: "Political Science, Institutional Economics and Governance",
        discipline: "Political economy · hegemony · sovereign coordination",
        intro: "The meso-institutional level: who gets to make which decisions, under which circumstances, accountable to whom, and how that changes over time — automation in socioeconomic systems as algorithmic policy-making.",
        definition: "The kernel is ideologically agnostic; the graph is the politics. A market-liberal assembly, a cooperative assembly, an Islamic-finance assembly, and a mutual-aid assembly all use the same kernel. This group reads the substrate as political theorists — Gramsci, Arendt, post-hegemony; the question of what governance is when the primitive refuses to take positions, and the Arendtian question of whether what the bonded primitive grants is a 'right to have rights' or, more narrowly, a capacity to have commerce.",
        papers: [
            { title: "The Wallet Without a Polity", href: "/papers/wallet-without-polity" },
            { title: "The Subordination Variable", href: "/papers/subordination-variable" },
            { title: "The Visibility of Coordination", href: "/papers/visibility-of-coordination" },
            { title: "The Ungoverned Substrate", href: "/papers/ungoverned-substrate" },
            { title: "Corridors Without a Hegemon: Bonded Settlement as Common Infrastructure Beneath Rival Trade Corridors", href: "/papers/corridors-without-a-hegemon" },
        ],
    },
    {
        slug: "operations-research",
        disciplineIndex: 6,
        name: "Operations Research and Management Science",
        discipline: "Resource allocation · accounting · ledger design",
        intro: "Allocation made operational: physical, financial, and social resources allocated among stakeholders with unique preferences, information, and capabilities — and the coordination and scaling of those allocation decisions.",
        definition: "A Figaro process is a self-closing ledger period. Commits are journal entries; resolution is the closing entry; the agreementHash is the contract document. This group reads the substrate as operations researchers and accountants — the kernel as an accounting primitive, the process topology as a coordination problem, the closure as a scheduling invariant.",
        papers: [
            { title: "Bookkeeping as Protocol Byproduct: Self-Closing Ledger Periods", href: "/papers/self-closing-ledger-periods" },
            { title: "Substrate-Broadening Retroactive Public-Goods Funding", href: "/papers/substrate-broadening-rpgf" },
        ],
    },
    {
        slug: "ai-optimization-control",
        disciplineIndex: 7,
        name: "AI, Optimization and Control Theory",
        discipline: "Agent coordination · allocation · control of the mesh",
        intro: "Steering and stability: encoding a coordination objective as a cost function and designing for dynamic stability around it, with the multiscale dynamics that link individual decisions to system-level outcomes.",
        definition: "Agent-mediated coordination over bonded commitments. The kernel's actor-neutrality property turns bonded commitments into the missing enforcement layer for mutually-untrusted multi-agent systems: the equilibrium's node comparisons contain nothing that could distinguish a program from a person, so the argument that holds for human counterparties holds for autonomous agents on the same arithmetic. The Agent SDK at the runtime tier (FigaroContext, proposer, policy gateway, executor) is the operational realization; the paper develops the control-theory reading.",
        papers: [
            { title: "Actor-Neutral Coordination over Bonded Commitments", href: "/papers/actor-neutral-coordination" },
        ],
        references: [
            { label: "SDK — agent surface", href: "https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md", note: "FigaroContext, ActionQueue, proposer" },
        ],
    },
    {
        slug: "psychology-decisions",
        disciplineIndex: 8,
        name: "Psychology and Decisions Science",
        discipline: "Behavioral game theory · incentive legibility · interface cognition",
        intro: "How individuals actually decide, given knowledge of the rules and uncertainty about the decisions of others; the security of any incentive system depends on how people respond to incentives — an empirical question, not a theorem.",
        definition: "How participants read a bonded equilibrium under uncertainty; the legibility of incentive structure to non-specialist readers. The cognitive operation a participant must perform is one comparison of two certain amounts at its own node, in an order whose first step depends on nobody — and because a defector is credited with what it retains, both branches straddle the prospect-theoretic reference point, so loss aversion weights the defecting branch instead of cancelling. The Van Huyck coordination failure loses the finality it runs on; the joint-liability peer-pressure channel is present without the social substrate.",
        papers: [
            { title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment", href: "/papers/behavioral-game-theory", formalCore: true },
        ],
    },
];

/** Where a paper page sits in the corpus grouping — its discipline plus its
 *  neighbours within that discipline. Drives the `PaperLayout` breadcrumb
 *  (Papers › Discipline › this paper) and the prev/next-in-discipline nav.
 *  `null` when the slug is not registered (no chrome is rendered). */
export interface PaperNavigation {
    discipline: { name: string; disciplineIndex: DisciplineIndex; anchor: string };
    prev: PaperRef | null;
    next: PaperRef | null;
}

/** Resolve a `/papers/<slug>` page's position from the registry. Papers are
 *  ordered within each discipline's `papers[]`; prev/next never cross a
 *  discipline boundary (the first paper has no prev, the last no next). */
export function getPaperNavigation(slug: string): PaperNavigation | null {
    const href = `/papers/${slug}`;
    for (const group of PAPER_GROUPS) {
        const i = group.papers.findIndex((p) => p.href === href);
        if (i === -1) continue;
        return {
            discipline: {
                name: group.name,
                disciplineIndex: group.disciplineIndex,
                anchor: `/working-groups#${group.slug}`,
            },
            prev: i > 0 ? group.papers[i - 1] : null,
            next: i < group.papers.length - 1 ? group.papers[i + 1] : null,
        };
    }
    return null;
}

