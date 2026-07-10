import type { DisciplineIndex } from "@/components/shared/DisciplineGlyph";

/**
 * Disciplinary grouping ("registry" was a tier-word homograph; the on-chain registries are the protocol anchors) — Voshmgir & Zargham, "Foundations of Cryptoeconomic
 * Systems" (2024, Figure 1). Eight disciplines, fixed. Each discipline is a
 * stable lens for reading the substrate; the list cannot grow or shrink
 * without departing from the taxonomy.
 *
 * Papers, `currentWork`, `grants`, and `venue` are all optional. Every
 * discipline always has a charter; `/cryptoeconomics` renders whatever
 * concrete work exists under each one, or just the charter when none
 * does yet. The asymmetry surfaces where the project actually is.
 *
 * Per-group `venue` overrides surface a dedicated channel when a
 * discipline has one. There is no project-wide coordination channel
 * today; PRs against this file are the canonical contribution path.
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
}

interface ReferenceLink {
    label: string;
    href: string;
    note?: string;
}

export interface PaperGroup {
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

export const PAPER_GROUPS: PaperGroup[] = [
    {
        slug: "economics-game-theory",
        disciplineIndex: 1,
        name: "Economics and Game Theory",
        discipline: "Mechanism design · institutional economics · monetary theory",
        charter: "The kernel rests on a game-theoretic argument: asymmetric bonding with a 2× minimum ratio produces a Nash equilibrium, scales itself from two to N parties through cumulative upstream bonding, and makes the subordination axis of the Coasean firm structurally optional — shifting the Coasean transaction-cost threshold inward, so the standing firm is no longer the uniquely efficient unit of production within the domain the primitive covers. This group reads the substrate as economists and game theorists read it — equilibrium analysis, institutional form, monetary design.",
        papers: [
            { title: "Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination", href: "/papers/asymmetric-bonding" },
            { title: "From Firms to Transaction-Scoped Institutions: A Coasean Re-Examination", href: "/papers/transaction-scoped-institutions" },
            { title: "FIG: A Schelling-Point Token for the Figaro Coordination Ecosystem", href: "/papers/fig-schelling-point-token" },
        ],
        references: [
            { label: "Protocol — two mechanisms", href: "/protocol", note: "two-mechanism + contract-law overview" },
            { label: "RPGF", href: "/rpgf", note: "the clause-author reward formula" },
        ],
    },
    {
        slug: "industrial-systems-engineering",
        disciplineIndex: 2,
        name: "Industrial and Systems Engineering",
        discipline: "Process modeling · supply-chain coordination",
        charter: "How bonded commitments compose into multi-party processes with auditable handoffs, lifecycle attestation, and proximity proof. Two worked examples: air service as coordinated resource markets (cascading-delay risk re-architected as unit-level bonded commitments) and permissionless container shipping (an ownerless successor to the failed TradeLens consortium).",
        papers: [
            { title: "Air Service as Coordinated Resource Markets", href: "/papers/air-service-coordination" },
            { title: "After TradeLens: A Permissionless Bonded Replacement", href: "/papers/after-tradelens" },
        ],
    },
    {
        slug: "computer-science-cryptography",
        disciplineIndex: 3,
        name: "Computer Science and Cryptography",
        discipline: "Cryptographic primitives · adversarial review · formal verification · protocol extension · runtime architecture",
        charter: "Two complementary lenses on the protocol's CS surface. Paper C reads the kernel adversarially: where does the invariant break, and what proves that it does not? EIP-712 dual-signed commitments, merkle-bound attestation receipts, SP1-proven batch execution, the formal-verification stack. Paper N reads what stands above the kernel as a research object: clause design as a CS discipline (four-layer verification stack, append-only identity, first-write-wins binding, atomic-bind pattern), the coordinator pattern with formal composition semantics and equilibrium-preservation conditions, and the seven-layer runtime composition pipeline. Implementation work (clause authoring, contract development, assembly composition, frontend) organizes separately at /builders.",
        papers: [
            { title: "Asymmetric Bonding and Buyer Dominance: A Verified Solidity Settlement Kernel", href: "/papers/verified-settlement-kernel" },
            { title: "Protocol Extension and Runtime Composition", href: "/papers/protocol-extension" },
        ],
        currentWork: [
            "Adversarial audit of the attestation coordinator's merkle-inclusion gate",
            "Extending the Certora token-ops inventory to cover batch-verifier fee-on-transfer paths",
            "TLA⁺ refinement of the cumulative-upstream-bonding mesh beyond 3 depth",
        ],
        references: [
            { label: "Specifications", href: "/spec", note: "the frozen on-chain surface" },
            { label: "Release readiness + freeze notice", href: "https://github.com/figaro-protocol/Figaro/blob/main/docs/RELEASE_READINESS.md" },
            { label: "Design decisions", href: "https://github.com/figaro-protocol/Figaro/blob/main/docs/DESIGN_DECISIONS.md", note: "fourteen patterns that look like bugs but are correct" },
            { label: "Audit report", href: "https://github.com/figaro-protocol/Figaro/blob/main/docs/AUDIT_REPORT.md" },
            { label: "Builders", href: "/builders", note: "implementation work — clauses, contracts, assemblies, frontend" },
        ],
    },
    {
        slug: "philosophy-law-ethics",
        disciplineIndex: 4,
        name: "Philosophy, Law and Ethics",
        discipline: "Contract theory · evidence law · labor law · stateless subjecthood · political philosophy",
        charter: "A Figaro commitment is a signed contract: payment = consideration, clauses = terms and conditions, agreementHash = the contract document. Settlement happens on-chain by nature; adjudication happens off-chain by nature. The wallet collapses the Roman res/persona distinction, and the primitive's precondition is a cryptographic key rather than civil-legal subjecthood. The platform is not a fact of nature; it is a contingent answer to a coordination problem the bonded primitive answers differently. This group reads the substrate as lawyers, philosophers, and ethicists read it.",
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
        name: "Political Science and Governance",
        discipline: "Political economy · hegemony · sovereign coordination",
        charter: "The kernel is ideologically agnostic; the graph is the politics. A market-liberal assembly, a cooperative assembly, an Islamic-finance assembly, and a mutual-aid assembly all use the same kernel. This group reads the substrate as political theorists — Gramsci, Arendt, post-hegemony; the question of what governance is when the primitive refuses to take positions, and the Arendtian question of whether what the bonded primitive grants is a 'right to have rights' or, more narrowly, a capacity to have commerce.",
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
        charter: "A Figaro process is a self-closing ledger period. Commits are journal entries; resolution is the closing entry; the agreementHash is the contract document. This group reads the substrate as operations researchers and accountants — the kernel as an accounting primitive, the process topology as a coordination problem, the closure as a scheduling invariant.",
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
        charter: "Agent-mediated coordination over bonded commitments. The kernel's actor-neutrality property turns bonded commitments into the missing enforcement layer for mutually-untrusted multi-agent systems: the same equilibrium argument that makes cooperation weakly dominant for human counterparties makes it weakly dominant for autonomous agents, on the same arithmetic. The Agent SDK at the runtime tier (FigaroContext, proposer, policy gateway, executor) is the operational realization; the paper develops the control-theory reading.",
        papers: [
            { title: "Actor-Neutral Coordination over Bonded Commitments", href: "/papers/actor-neutral-coordination" },
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
        papers: [
            { title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment", href: "/papers/behavioral-game-theory" },
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
                anchor: `/cryptoeconomics#discipline-${group.disciplineIndex}`,
            },
            prev: i > 0 ? group.papers[i - 1] : null,
            next: i < group.papers.length - 1 ? group.papers[i + 1] : null,
        };
    }
    return null;
}

