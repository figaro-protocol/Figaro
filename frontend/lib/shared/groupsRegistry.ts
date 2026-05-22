import type { DisciplineIndex } from "@/components/shared/DisciplineGlyph";

/**
 * Disciplinary registry — Voshmgir & Zargham, "Foundations of Cryptoeconomic
 * Systems" (2024, Figure 1). Eight disciplines, fixed. Each discipline is a
 * stable lens for reading the substrate; the list cannot grow or shrink
 * without departing from the taxonomy.
 *
 * Papers, `currentWork`, `grants`, and `venue` are all optional. Every
 * discipline always has a charter; `/research` renders whatever
 * concrete work exists under each one, or just the charter when none
 * does yet. The asymmetry surfaces where the project actually is.
 *
 * Per-group `venue` overrides surface a dedicated channel when a
 * discipline has one. There is no project-wide coordination channel
 * today; PRs against this file are the canonical contribution path.
 *
 * To amend an entry, open a PR against this file. PRs are reviewed at
 * merge time like any other; the registry shape is the contract, not
 * the merge process.
 */

export interface PaperRef {
    /** Full title. */
    title: string;
    /** Path to the PDF. */
    href: string;
}

export interface ReferenceLink {
    label: string;
    href: string;
    note?: string;
}

export interface GroupRegistryEntry {
    /** URL slug (stable). Used for `#discipline-N`-style anchors. */
    slug: string;
    /** 1–8 — drives the `<DisciplineGlyph>` and the per-discipline anchor. */
    disciplineIndex: DisciplineIndex;
    /** Zargham's discipline name. */
    name: string;
    /** Short methodological gloss (subdiscipline). */
    discipline: string;
    /** One-paragraph framing: what this discipline asks of the Figaro substrate. */
    charter: string;
    /** Papers primarily assigned to this discipline. Empty array means
     *  the discipline is an open call — no canonical work convened yet. */
    papers: PaperRef[];
    /** Cross-references to other internal surfaces (specs, runtime,
     *  cross-discipline papers). Optional. */
    references?: ReferenceLink[];
    /** Current work in progress, as contributors describe it. */
    currentWork?: string[];
    /** Where the conversation happens — only when the group has its OWN
     *  dedicated channel separate from the project-wide Telegram. Most
     *  entries leave this undefined and inherit the project default. */
    venue?: { label: string; href: string };
    /** Grants received (DAO proposals, Gitcoin rounds, direct). */
    grants?: { label: string; href: string; amount?: string }[];
    /** Addresses or handles contributors choose to publish. */
    contributors?: string[];
}

export const GROUPS_REGISTRY: GroupRegistryEntry[] = [
    {
        slug: "economics-game-theory",
        disciplineIndex: 1,
        name: "Economics and Game Theory",
        discipline: "Mechanism design · institutional economics · monetary theory",
        charter: "The kernel rests on a game-theoretic argument: asymmetric bonding with a 2× minimum ratio produces a Nash equilibrium, scales itself from two to N parties through progressive collateralization, and makes the subordination axis of the Coasean firm structurally optional. This group reads the substrate as economists and game theorists read it — equilibrium analysis, institutional form, monetary design.",
        papers: [
            { title: "Asymmetric Bonding: A Self-Enforcing Settlement Primitive", href: "/papers/figaro-mechanism.pdf" },
        ],
        references: [
            { label: "Protocol — two mechanisms", href: "/protocol", note: "two-mechanism + contract-law overview" },
            { label: "RPGF", href: "/rpgf", note: "the schema-author reward formula" },
        ],
    },
    {
        slug: "industrial-systems-engineering",
        disciplineIndex: 2,
        name: "Industrial and Systems Engineering",
        discipline: "Process modeling · supply-chain coordination",
        charter: "How bonded commitments compose into multi-party processes with auditable handoffs, lifecycle attestation, and proximity proof. Two worked examples: air service as coordinated resource markets (cascading-delay risk re-architected as unit-level bonded commitments) and permissionless container shipping (an ownerless successor to the failed TradeLens consortium).",
        papers: [
            { title: "Air Service as Coordinated Resource Markets", href: "/papers/figaro-airways.pdf" },
            { title: "After TradeLens: A Permissionless Bonded Replacement", href: "/papers/figaro-tradelens.pdf" },
        ],
    },
    {
        slug: "computer-science-cryptography",
        disciplineIndex: 3,
        name: "Computer Science and Cryptography",
        discipline: "Cryptographic primitives · adversarial review · formal verification · protocol extension · runtime architecture",
        charter: "Two complementary lenses on the protocol's CS surface. Paper C reads the kernel adversarially: where does the invariant break, and what proves that it does not? EIP-712 dual-signed commitments, merkle-bound attestation receipts, SP1-proven batch execution, the formal-verification stack. Paper N reads what stands above the kernel as a research object: schema design as a CS discipline (four-layer verification stack, append-only identity, first-write-wins binding, atomic-bind pattern), the coordinator pattern with formal composition semantics and equilibrium-preservation conditions, and the seven-layer runtime composition pipeline. Implementation work (schema authoring, contract development, assembly composition, frontend) organizes separately at /builders.",
        papers: [
            { title: "Asymmetric Bonding and Buyer Dominance: A Verified Solidity Settlement Kernel", href: "/papers/figaro-verification.pdf" },
            { title: "Protocol Extension and Runtime Composition", href: "/papers/figaro-protocol-extension.pdf" },
        ],
        currentWork: [
            "Adversarial audit of the attestation coordinator's merkle-inclusion gate",
            "Extending the Certora token-ops inventory to cover batch-verifier fee-on-transfer paths",
            "TLA⁺ refinement of the progressive-collateralization mesh beyond 3 depth",
        ],
        references: [
            { label: "Specifications", href: "/spec", note: "the frozen on-chain surface" },
            { label: "Release readiness + freeze notice", href: "https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/RELEASE_READINESS.md" },
            { label: "Design decisions", href: "https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/DESIGN_DECISIONS.md", note: "fourteen patterns that look like bugs but are correct" },
            { label: "Audit report", href: "https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/AUDIT_REPORT.md" },
            { label: "Builders", href: "/builders", note: "implementation work — schemas, contracts, assemblies, frontend" },
        ],
    },
    {
        slug: "philosophy-law-ethics",
        disciplineIndex: 4,
        name: "Philosophy, Law and Ethics",
        discipline: "Contract theory · evidence law · labor law · stateless subjecthood · political philosophy",
        charter: "A Figaro commitment is a signed contract: payment = consideration, schemas = terms and conditions, agreementHash = the contract document. Settlement happens on-chain by nature; adjudication happens off-chain by nature. The wallet collapses the Roman res/persona distinction, and the primitive's precondition is a cryptographic key rather than civil-legal subjecthood. This group reads the substrate as lawyers, philosophers, and ethicists read it.",
        papers: [],
    },
    {
        slug: "political-science-governance",
        disciplineIndex: 5,
        name: "Political Science and Governance",
        discipline: "Political economy · hegemony · sovereign coordination",
        charter: "The kernel is ideologically agnostic; the graph is the politics. A market-liberal assembly, a cooperative assembly, an Islamic-finance assembly, and a mutual-aid assembly all use the same kernel. This group reads the substrate as political theorists — Gramsci, Arendt, post-hegemony; the question of what governance is when the primitive refuses to take positions.",
        papers: [],
    },
    {
        slug: "operations-research",
        disciplineIndex: 6,
        name: "Operations Research and Management Science",
        discipline: "Resource allocation · accounting · ledger design",
        charter: "A Figaro process is a self-closing ledger period. Commits are journal entries; resolution is the closing entry; the agreementHash is the contract document. This group reads the substrate as operations researchers and accountants — the kernel as an accounting primitive, the process DAG as a coordination problem, the closure as a scheduling invariant.",
        papers: [],
    },
    {
        slug: "ai-optimization-control",
        disciplineIndex: 7,
        name: "AI, Optimization and Control Theory",
        discipline: "Agent coordination · allocation · control of the mesh",
        charter: "Agent-mediated coordination over bonded commitments. The kernel's actor-neutrality property turns bonded commitments into the missing enforcement layer for mutually-untrusted multi-agent systems: the same equilibrium argument that makes cooperation weakly dominant for human counterparties makes it weakly dominant for autonomous agents, on the same arithmetic. The Agent SDK at the runtime tier (FigaroContext, proposer, policy gateway, executor) is the operational realization; the paper develops the control-theory reading.",
        papers: [
            { title: "Agent Coordination over Bonded Commitments", href: "/papers/figaro-agent-coordination.pdf" },
        ],
        references: [
            { label: "SDK — agent surface", href: "/integrate", note: "FigaroContext, ActionQueue, proposer" },
        ],
    },
    {
        slug: "psychology-decisions",
        disciplineIndex: 8,
        name: "Psychology and Decisions Science",
        discipline: "Behavioral game theory · incentive legibility · interface cognition",
        charter: "How participants read a bonded equilibrium under uncertainty; the legibility of incentive structure to non-specialist readers. The bonded mechanism is dominance-solvable at the per-player level — the cognitive operation a participant must perform is a single comparison at the margin, amplified by loss aversion at the kink between cooperation and defection. The Van Huyck coordination-failure result does not transfer; the Grameen peer-pressure dynamics do.",
        papers: [],
    },
];

