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
    /** One-line description surfaced in the listing, derived from the paper's
     *  own abstract. Adds no claim the paper does not already make. */
    blurb?: string;
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
            { title: "Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination", href: "/papers/asymmetric-bonding", formalCore: true, blurb: "Derives the two composing mechanisms and their equilibrium from first principles: asymmetric bonding makes cooperation weakly dominant and scales it along a process chain; buyer dominance with atomic resolution induces a weakest-link subgame." },
            { title: "From Firms to Transaction-Scoped Institutions: A Coasean Re-Examination", href: "/papers/transaction-scoped-institutions", blurb: "A Coasean re-examination: when bilateral enforcement collapses to a fixed capital lockup, the firm's subordination overlay loses its cost advantage and becomes one organizational pattern among several." },
            { title: "The Florin: A Schelling-Point Token for the Figaro Coordination Ecosystem", href: "/papers/florin-schelling-point-token", blurb: "The florin as a pure focal-point token — its value is its focality, not yield, governance, fees, or settlement-coupled emission — defined by what it refuses to do." },
        ],
        references: [
            { label: "Protocol — two mechanisms", href: "/protocol", note: "two-mechanism + contract-law overview" },
            { label: "Clause rewards", href: "/clause-rewards", note: "the clause-author reward formula" },
        ],
    },
    {
        slug: "industrial-systems-engineering",
        disciplineIndex: 2,
        name: "Industrial and Systems Engineering",
        discipline: "Process modeling · supply-chain coordination",
        charter: "How bonded commitments compose into multi-party processes with auditable handoffs, lifecycle attestation, and proximity proof. Two worked examples: air service as coordinated resource markets (cascading-delay risk re-architected as unit-level bonded commitments) and permissionless container shipping (an ownerless successor to the failed TradeLens consortium).",
        papers: [
            { title: "Air Service as Coordinated Resource Markets", href: "/papers/air-service-coordination", blurb: "Air service as coordination across resource markets, each an asset-as-wallet; under buyer-dominant atomic resolution the seller cohort compensates directly before any external mechanism engages." },
            { title: "After TradeLens: A Permissionless Bonded Replacement", href: "/papers/after-tradelens", blurb: "Why TradeLens failed structurally — a competitor-controlled platform asking rivals to ratify its gatekeeping — and how a permissionless bonded composition coordinates the logistics perimeter without a consortium." },
        ],
    },
    {
        slug: "computer-science-cryptography",
        disciplineIndex: 3,
        name: "Computer Science and Cryptography",
        discipline: "Cryptographic primitives · adversarial review · formal verification · protocol composition · runtime architecture",
        charter: "Two complementary lenses on the protocol's CS surface. The verified settlement kernel reads the kernel adversarially: where does the invariant break, and what proves that it does not? EIP-712 dual-signed commitments, merkle-bound attestation receipts, SP1-proven batch execution, the formal-verification stack. Protocol composition reads what stands above the kernel as a research object: clause design as a CS discipline (four-layer verification stack, append-only identity, first-write-wins binding, atomic-bind pattern), the coordinator pattern with formal composition semantics and equilibrium-preservation conditions, and the seven-layer runtime composition pipeline. Implementation work (clause authoring, contract development, assembly composition, frontend) organizes separately at /builders.",
        papers: [
            { title: "Asymmetric Bonding and Buyer Dominance: A Verified Solidity Settlement Kernel", href: "/papers/verified-settlement-kernel", formalCore: true, blurb: "A reference implementation of the two-mechanism kernel — ownerless, fee-less, admin-less — with the machine-checked verification methodology, threat model, and coordinator pattern for equilibrium-preserving composition." },
            { title: "Protocol Composition: Clause Design, the Coordinator Pattern, and Runtime Architecture Above the Kernel", href: "/papers/protocol-extension", formalCore: true, blurb: "How the kernel becomes a protocol: a decision rule for composition, clause design as a verification discipline, the coordinator pattern's sufficient conditions, and the runtime composition pipeline." },
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
            { title: "On-Chain Evidence, Off-Chain Adjudication", href: "/papers/on-chain-evidence", blurb: "Settlement is on-chain by nature, adjudication off-chain by nature: a layered approach in which the protocol produces evidence existing courts already know how to use." },
            { title: "The Wallet as Legal Subject", href: "/papers/wallet-legal-subject", blurb: "Labor law classifies along one axis — subordination — which the primitive makes architecturally optional in a region of transactions, where the classification problem loses its subject." },
            { title: "Coercion as a Substrate Variable", href: "/papers/coercion-variable", blurb: "The primitive performs law's enforcement function in bilateral commerce without a coercive apparatus; coercion becomes a substrate variable and the question of its legitimacy relocates to a bounded domain." },
            { title: "The Disclosure Asymmetry: Cryptoeconomic Mechanism Design and the Engineering of Consent", href: "/papers/the-disclosure-asymmetry", blurb: "Mechanism design as the engineering of consent with the sign flipped by disclosure: making the rules common knowledge and deterministically enforced reverses their epistemic dependence. A reply to Viljoen, Goldenfein & McGuigan." },
            { title: "Code Is Constitution: The Entrenched Layer Beneath Enactment", href: "/papers/code-is-constitution", blurb: "Against 'code is law': decentralized protocols are the entrenched procedural layer beneath enactment — rules about rules — with ordinary law re-seated at the boundary as a consumer of their evidence." },
        ],
    },
    {
        slug: "political-science-governance",
        disciplineIndex: 5,
        name: "Political Science and Governance",
        discipline: "Political economy · hegemony · sovereign coordination",
        charter: "The kernel is ideologically agnostic; the graph is the politics. A market-liberal assembly, a cooperative assembly, an Islamic-finance assembly, and a mutual-aid assembly all use the same kernel. This group reads the substrate as political theorists — Gramsci, Arendt, post-hegemony; the question of what governance is when the primitive refuses to take positions, and the Arendtian question of whether what the bonded primitive grants is a 'right to have rights' or, more narrowly, a capacity to have commerce.",
        papers: [
            { title: "The Wallet Without a Polity", href: "/papers/wallet-without-polity", blurb: "The primitive's precondition is a cryptographic key, not civil-legal subjecthood; for the displaced and stateless it grants not the right to have rights but a capacity to have commerce." },
            { title: "The Subordination Variable", href: "/papers/subordination-variable", blurb: "Both the socialist and capitalist traditions hinge on the wage/subordination relation; removing it from the substrate lets one artifact admit both readings and relocates the partition to the graph." },
            { title: "The Visibility of Coordination", href: "/papers/visibility-of-coordination", blurb: "A Gramscian reading: 'two strangers need a platform to transact safely' is a hegemonic proposition, not a structural necessity, once the coordination function is a separable design choice." },
            { title: "The Ungoverned Substrate", href: "/papers/ungoverned-substrate", blurb: "Against the assumption that the alternative to state coordination must itself be governed: an invariant, ungoverned substrate on which arbitrary governed entities compose." },
            { title: "Corridors Without a Hegemon: Bonded Settlement as Common Infrastructure Beneath Rival Trade Corridors", href: "/papers/corridors-without-a-hegemon", blurb: "Rival trade corridors contest control of the corridor itself; an ownerless bonded substrate can be common ground beneath them because nobody owns it, neutralizing the settlement-layer chokepoint." },
        ],
    },
    {
        slug: "operations-research",
        disciplineIndex: 6,
        name: "Operations Research and Management Science",
        discipline: "Resource allocation · accounting · ledger design",
        charter: "A Figaro process is a self-closing ledger period. Commits are journal entries; resolution is the closing entry; the agreementHash is the contract document. This group reads the substrate as operations researchers and accountants — the kernel as an accounting primitive, the process topology as a coordination problem, the closure as a scheduling invariant.",
        papers: [
            { title: "Bookkeeping as Protocol Byproduct: Self-Closing Ledger Periods", href: "/papers/self-closing-ledger-periods", blurb: "A Figaro process as a self-closing ledger period — commitments are journal entries, resolution the closing entry, the conservation law the bookkeeping identity — making a class of record-keeping a protocol byproduct." },
            { title: "Substrate-Broadening Retroactive Public-Goods Funding", href: "/papers/substrate-broadening-rpgf", blurb: "An allocation that distributes florins to clause authors and assembly designers, scoring artifacts by counterparty diversity over raw volume — counted on chain as each settled process lands, so there is no result to post, bond, or challenge." },
        ],
    },
    {
        slug: "ai-optimization-control",
        disciplineIndex: 7,
        name: "AI, Optimization and Control Theory",
        discipline: "Agent coordination · allocation · control of the mesh",
        charter: "Agent-mediated coordination over bonded commitments. The kernel's actor-neutrality property turns bonded commitments into the missing enforcement layer for mutually-untrusted multi-agent systems: the same equilibrium argument that makes cooperation weakly dominant for human counterparties makes it weakly dominant for autonomous agents, on the same arithmetic. The Agent SDK at the runtime tier (FigaroContext, proposer, policy gateway, executor) is the operational realization; the paper develops the control-theory reading.",
        papers: [
            { title: "Actor-Neutral Coordination over Bonded Commitments", href: "/papers/actor-neutral-coordination", blurb: "The kernel reads signatures and bond posture, not entity type, so the equilibrium that makes cooperation dominant for humans extends without modification to autonomous agents. A control-theory reading of the Agent SDK." },
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
            { title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment", href: "/papers/behavioral-game-theory", formalCore: true, blurb: "How the full-rationality equilibrium carries over to real participants: weak dominance at the kink, why the Van Huyck coordination failure does not transfer, and atomic resolution as activated peer pressure." },
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

