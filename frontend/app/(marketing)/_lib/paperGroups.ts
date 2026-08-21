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
        definition: "The kernel rests on a game-theoretic argument: the doubled bonding schedule — the buyer twice the payment, each seller twice the value the chain has accumulated through its own link — produces a Nash equilibrium, carries it from two parties to N because every seller's bond is keyed to that accumulator, and makes the subordination axis of the Coasean firm structurally optional — shifting the Coasean transaction-cost threshold inward, so the standing firm is no longer the uniquely efficient unit of production within the domain the primitive covers. This group reads the substrate as economists and game theorists read it — equilibrium analysis, institutional form, market formation, monetary design.",
        papers: [
            { title: "Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination", href: "/papers/asymmetric-bonding", formalCore: true, blurb: "Derives the two composing mechanisms and their equilibrium from first principles: after performance, resolving is strictly better for the buyer, and performance is then each seller's strict best response — asymmetric bonding carrying that order along the process chain, buyer dominance with atomic resolution inducing a weakest-link subgame among sellers." },
            { title: "Markets Without a Venue: Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Settlement Layer", href: "/papers/markets-without-a-venue", formalCore: true, blurb: "Two ways an offer forms above a settlement layer that knows nothing about markets — a dispatch race over already-published prices and a request for quotes at the buyer's ceiling — classified as a posted-price mechanism and a sealed-bid first-price procurement auction: mutual exclusion follows from which side signs last, first price is forced because the winner is paid a field of the struct it signed, and the participation constraint is a balance stated in the request rather than a private valuation." },
            { title: "From Firms to Transaction-Scoped Institutions: A Coasean Re-Examination", href: "/papers/transaction-scoped-institutions", blurb: "A Coasean re-examination: when bilateral enforcement collapses to a fixed capital lockup, the firm's subordination overlay loses its cost advantage and becomes one organizational pattern among several." },
            { title: "The Florin: A Schelling-Point Token for the Figaro Coordination Ecosystem", href: "/papers/florin-schelling-point-token", blurb: "The florin as a pure focal-point token — its value is its focality, not yield, governance, fees, or settlement-coupled emission — defined by what it refuses to do." },
            { title: "Self-Authenticating Data Sales: Dissolving Arrow's Information Paradox Through Bonded Settlement", href: "/papers/self-authenticating-data-sales", blurb: "A dataset sold on ordinary terms suffers Arrow's information paradox; merkle-committed, bonded agreements dissolve it economically rather than cryptographically — the appropriation horn closes because paying the seller and reclaiming one's own bond are the same call, verified provenance plus a bond that bounds what misdescription can be worth answers the valuation horn, and the stream is the repeated game that sustains honest data production." },
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
            { title: "Air Service as Coordinated Resource Markets", href: "/papers/air-service-coordination", blurb: "Air service as coordination across resource markets — crew, aircraft, fuel, slots, catering, maintenance, ground handling — each provider a wallet bonded directly to the passenger inside one process, the cohort compensating the passenger directly before any external mechanism engages; the public-authority wallets are the paper's declared thought experiment." },
            { title: "After TradeLens: A Permissionless Bonded Replacement", href: "/papers/after-tradelens", blurb: "Why TradeLens failed structurally — a competitor-controlled platform asking rivals to ratify its gatekeeping — and how a permissionless bonded composition coordinates the logistics perimeter without a consortium." },
        ],
    },
    {
        slug: "computer-science-cryptography",
        disciplineIndex: 3,
        name: "Computer Science and Cryptography",
        discipline: "Cryptographic primitives · adversarial review · formal verification · protocol composition · runtime architecture",
        intro: "Economic policies embedded in software: protocol and smart-contract code as the rule layer, cryptographic tools combined with economic incentives so that the cost of wrongdoing is disproportionate to its benefit.",
        definition: "Two complementary lenses on the protocol's CS surface. The verified settlement kernel reads the kernel adversarially: where does the invariant break, and what proves that it does not? EIP-712 dual-signed commitments, the attestation surface, the formal-verification stack, and the boundary between the direct settlement path and the proof-batched one. Protocol composition reads what stands above the kernel as a research object: the composition doctrine (anchored-reference pattern, append-only identity, first-write-wins binding), clause design as a CS discipline (canonical specification, content-addressed registration, and the merkle-binding that makes a registered clause attestable with no per-clause on-chain code), and the coordinator pattern with formal composition semantics and equilibrium-preservation conditions discharged on worked composers. Implementation work (clause authoring, contract development, assembly composition, frontend) organizes on the Clauses and Assemblies surfaces.",
        papers: [
            { title: "A Verified Settlement Kernel: Formal Verification, Threat Model, and the Scope of the Claim", href: "/papers/verified-settlement-kernel", formalCore: true, blurb: "A reference implementation of the two-mechanism kernel — ownerless, fee-less, admin-less — with the machine-checked verification methodology, the properties each method actually establishes, the threat model, and an honest boundary between the direct settlement path and the proof-batched one." },
            { title: "Protocol Composition: A Decision Rule, Clause Design, and the Coordinator Pattern", href: "/papers/protocol-composition", formalCore: true, blurb: "How the kernel becomes a protocol: a decision rule for composition, clause design as a verification discipline, the coordinator pattern's sufficient conditions." },
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
            { title: "On-Chain Evidence, Off-Chain Adjudication", href: "/papers/on-chain-evidence", blurb: "Settlement is on-chain by nature, adjudication off-chain by nature: a layered approach in which the protocol produces evidence existing courts already know how to use." },
            { title: "The Wallet as Legal Subject", href: "/papers/wallet-legal-subject", blurb: "Legal-doctrinal: labor law classifies along one axis — subordination — which the primitive makes architecturally optional in a region of transactions, where the classification problem loses its subject; the wallet collapses the Roman res/persona distinction, and the paper names the trade-off, a leveller on subordination that privatizes employment-attached protections. Reads the AB5/Proposition 22, Aslam, and 2024 Platform Work Directive line of authority." },
            { title: "Coercion as a Substrate Variable", href: "/papers/coercion-variable", blurb: "The primitive performs law's enforcement function in bilateral commerce without a coercive apparatus; coercion becomes a substrate variable and the question of its legitimacy relocates to a bounded domain." },
            { title: "The Disclosure Asymmetry: Cryptoeconomic Mechanism Design and the Engineering of Consent", href: "/papers/the-disclosure-asymmetry", blurb: "Mechanism design as the engineering of consent with the sign flipped by disclosure: making the rules common knowledge and deterministically enforced reverses their epistemic dependence. A reply to Viljoen, Goldenfein & McGuigan." },
            { title: "Code Is Constitution: The Entrenched Layer Beneath Enactment", href: "/papers/code-is-constitution", blurb: "Against 'code is law': decentralized protocols are the entrenched procedural layer beneath enactment — rules about rules — with ordinary law re-seated at the boundary as a consumer of their evidence." },
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
            { title: "The Wallet Without a Polity", href: "/papers/wallet-without-polity", blurb: "The primitive's precondition is a cryptographic key, not civil-legal subjecthood; for the displaced and stateless it grants not the right to have rights but a capacity to have commerce." },
            { title: "The Subordination Variable", href: "/papers/subordination-variable", blurb: "Political economy, not legal doctrine: both the socialist and capitalist traditions hinge on the wage/subordination relation, so removing it from the substrate lets one artifact admit both the associated-producer and the frictionless-market reading — and relocates the partition from the architecture of production to the graph, where distribution and public goods are argued." },
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
        intro: "Allocation made operational: physical, financial, and social resources allocated among stakeholders with unique preferences, information, and capabilities — and the coordination and scaling of those allocation decisions.",
        definition: "A Figaro process is a self-closing ledger period. Commits are journal entries; resolution is the closing entry; the agreementHash is the contract document. This group reads the substrate as operations researchers and accountants — the kernel as an accounting primitive, the process topology as a coordination problem, the closure as a scheduling invariant.",
        papers: [
            { title: "Bookkeeping as Protocol Byproduct: Self-Closing Ledger Periods", href: "/papers/self-closing-ledger-periods", blurb: "A Figaro process as a self-closing ledger period — an accounting entity whose assets equal the claims against it at every moment, so its equity is identically zero, whose commitments are journal entries, and whose buyer's single atomic resolution is the closing entry that zeroes every account the period opened — making a class of record-keeping a protocol byproduct." },
            { title: "Substrate-Broadening Retroactive Public-Goods Funding", href: "/papers/substrate-broadening-rpgf", blurb: "An allocation that distributes florins to clause authors and assembly designers, scoring clauses and assemblies by distinct live-staked sellers of record rather than volume or value — counted on chain as each settled process lands, so there is no result to post, bond, or challenge, with Sybil resistance carried by the two-sided live stake." },
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
            { title: "Actor-Neutral Coordination over Bonded Commitments", href: "/papers/actor-neutral-coordination", blurb: "The kernel reads signatures and bond posture, not entity type, so an equilibrium whose node comparisons cannot tell a program from a person extends without modification to autonomous agents. A control-theory reading of the Agent SDK." },
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
            { title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment", href: "/papers/behavioral-game-theory", formalCore: true, blurb: "How the equilibrium fares once participants are real: loss aversion at the kink where retention and bond fall on opposite sides, why the Van Huyck coordination failure has no outcome to converge on, and atomic resolution as activated peer pressure." },
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

