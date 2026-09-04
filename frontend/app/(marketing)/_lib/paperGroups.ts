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
 * Papers and `venue` are optional. Every
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

export interface PaperRef {
    /** Full title. */
    title: string;
    /** Page route (`/papers/<slug>`) for a migrated paper, or path to the
     *  PDF (`/papers/<name>.pdf`) for one still authored in LaTeX. */
    href: string;
    /** The abstract in one breath, at most about forty-five words, so the
     *  corpus index can show what the paper treats without opening it. */
    summary: string;
    /** The paper's keywords, in the paper's own order. The paper page reads
     *  them from here; nothing carries a second copy. Each keyword is an
     *  index entry (`/working-groups/on/<slug>`). */
    keywords: string[];
    /** The reader's index: the industries or fields a reader arrives from
     *  for which this paper is a starting point (`/working-groups/for/<slug>`).
     *  Empty when the paper is theory with no such doorway. */
    industries: string[];
}

export interface PaperGroup {
    /** URL slug (stable). Used for `#<slug>`-style anchors on /working-groups. */
    slug: string;
    /** 1–8 — the paper's own stable taxonomy ordinal (identity, not display; the URL anchor is driven by `slug`). */
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
    /** Where the conversation happens — only when the group has its OWN
     *  dedicated channel. No project-wide channel exists to inherit;
     *  undefined means the group has not published one. */
    venue?: { label: string; href: string };
}

export const PAPER_GROUPS: PaperGroup[] = [
    {
        slug: "economics-game-theory",
        disciplineIndex: 1,
        name: "Economics and Game Theory",
        discipline: "Mechanism design · market design · institutional economics · monetary theory",
        intro: "The micro-foundations: mechanism design as reverse game theory — constructing the game so that the desired behavior is what self-interested actors converge on — tempered by the evolution-of-cooperation result that cooperation among selfish actors is a sufficient condition, not a necessary one, so richer theories of human behavior belong here too.",
        definition: "What a market can be built out of, once the standing firm is no longer the uniquely efficient unit of production. This group reads the substrate as economists and game theorists read it — the bonding equilibrium and its extension from two parties to N, institutional form, market formation, monetary design.",
        papers: [
            {
                title: "Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination",
                href: "/papers/asymmetric-bonding",
                summary: "The two calls of the kernel and why they compose: commit locks a bond on each side, resolve closes every order at once on the buyer's signature alone, and at every link a defector is left out of pocket even after crediting what it keeps.",
                keywords: ["mechanism design", "subgame-perfect equilibrium", "Nash equilibrium", "asymmetric bonding", "multi-party coordination", "process chains", "peer enforcement"],
                industries: [],
            },
            {
                title: "Markets Without a Venue: Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Settlement Layer",
                href: "/papers/markets-without-a-venue",
                summary: "How a market forms with no venue holding state: the buyer circulates the unsigned commitment itself, as a dispatch race or a sealed-bid request for quotes, and mutual exclusion, discovery, stake, and the trail all follow from the order of signatures.",
                keywords: ["market design", "auction theory", "matching theory", "procurement", "posted prices", "offer formation", "sealed-bid", "reserve price", "bonded settlement"],
                industries: ["Procurement", "Marketplaces"],
            },
            {
                title: "From Firms to Transaction-Scoped Institutions: A Coasean Re-Examination",
                href: "/papers/transaction-scoped-institutions",
                summary: "What happens to Coase's boundary of the firm when the cost of enforcing an agreement between strangers collapses to a fixed, jurisdiction-free lockup: the firm keeps a region, and outside it an institution lasts one transaction.",
                keywords: ["transaction cost economics", "theory of the firm", "subordination", "coordination economics", "two-sided markets", "organizational substrate", "institutional economics"],
                industries: ["Firms and strategy"],
            },
            {
                title: "Coordination Substrates: Firm, Platform, Court, and Bond",
                href: "/papers/coordination-substrates",
                summary: "Four ways to make a stranger's promise good, compared on ten institutional axes: internalize it in a firm, route it through a platform, leave it to a court, or have the parties bond it themselves before the trade.",
                keywords: ["comparative institutional analysis", "discriminating alignment", "transaction cost economics", "contract enforcement", "two-sided markets", "private ordering", "bonded commitment", "institutional substrates", "regulatory reporting", "unit of account"],
                industries: ["Regulation and licensing", "E-invoicing and tax", "Platforms"],
            },
            {
                title: "The Florin: A Schelling-Point Token for the Figaro Coordination Ecosystem",
                href: "/papers/florin-schelling-point-token",
                summary: "The florin as a Schelling point and nothing else: what it must not do, no yield, no governance, no fee path, no privileged denomination, so that it stays a credible focal point for strangers with no other unit in common.",
                keywords: ["cryptoeconomics", "Schelling point", "focal-point coordination", "token design", "coordination token", "utility token", "community token", "denomination", "supply integrity", "fixed supply cap", "design exclusions"],
                industries: ["Tokens and treasuries"],
            },
            {
                title: "Self-Authenticating Data Sales: Dissolving Arrow's Information Paradox Through Bonded Settlement",
                href: "/papers/self-authenticating-data-sales",
                summary: "Arrow's paradox for data, dissolved economically: each entry sold carries a proof it came from a real resolved trade, the licence carries a proof of the sale, and the doubled bond leaves a misdescribing seller out of pocket.",
                keywords: ["information paradox", "mechanism design", "merkle proofs", "data markets", "asymmetric bonding", "disclosure", "repeated games"],
                industries: ["Data markets"],
            },
        ],
    },
    {
        slug: "industrial-systems-engineering",
        disciplineIndex: 2,
        name: "Industrial and Systems Engineering",
        discipline: "Process modeling · supply-chain coordination",
        intro: "The system as a designed whole: complex adaptive networks whose collective behavior cannot be inferred from individual actions, and resilient protocol design that accounts for the network's spatial and temporal dynamics.",
        definition: "How bonded commitments compose into multi-party processes with auditable handoffs, lifecycle attestation, and proximity proof. This group reads the substrate as process and supply-chain engineers read it, worked through on two sectors that already coordinate at scale — air service, and container shipping after TradeLens.",
        papers: [
            {
                title: "Air Service as Coordinated Resource Markets",
                href: "/papers/air-service-coordination",
                summary: "Air service read as coordination across resource markets: crew, aircraft time, fuel, gates, catering, handling, each provider a wallet, the passenger the buyer of every order, one resolution paying the whole flight.",
                keywords: ["scheduled-service coordination", "supply-chain coordination", "process modeling", "resource markets", "weakest-link coordination", "industrial engineering"],
                industries: ["Air service", "Procurement"],
            },
            {
                title: "After TradeLens: A Permissionless Bonded Replacement",
                href: "/papers/after-tradelens",
                summary: "Why TradeLens failed as a structure, not as software, and the permissionless alternative at the same perimeter: carriers, ports, customs, forwarders, and financiers each bonded into one import chain under incoterms, custody, and cold-chain terms.",
                keywords: ["container shipping", "supply-chain coordination", "bills of lading", "Incoterms", "MLETR", "transferable records", "process modeling"],
                industries: ["Container shipping", "Freight and customs"],
            },
        ],
    },
    {
        slug: "computer-science-cryptography",
        disciplineIndex: 3,
        name: "Computer Science and Cryptography",
        discipline: "Cryptographic primitives · adversarial review · formal verification · protocol composition · runtime architecture",
        intro: "Economic policies embedded in software: protocol and smart-contract code as the rule layer, cryptographic tools combined with economic incentives so that the cost of wrongdoing is disproportionate to its benefit.",
        definition: "Two complementary lenses on the protocol's CS surface: what stands above the kernel as a research object — the composition doctrine, clause design as a discipline, the coordinator pattern — and the kernel read adversarially, asking where an invariant would break and what proves that it does not. This group reads the substrate as engineers, cryptographers and verification people read it; the implementation work itself — clause authoring, contract development, assembly composition, frontend — organizes on Clauses and Assemblies.",
        papers: [
            {
                title: "A Verified Settlement Kernel: Formal Verification, Threat Model, and the Scope of the Claim",
                href: "/papers/verified-settlement-kernel",
                summary: "The reference implementation and what has been machine-checked about it: model checking, fuzzing, symbolic execution, and specification checking by the project itself, with no external audit yet, and the precise scope of each.",
                keywords: ["smart contracts", "formal verification", "model checking", "symbolic execution", "property-based fuzzing", "EIP-712", "settlement layer", "verification scope"],
                industries: ["Security and audit"],
            },
            {
                title: "Protocol Composition: A Decision Rule, Clause Design, and the Coordinator Pattern",
                href: "/papers/protocol-composition",
                summary: "What stands above the kernel as a discipline: when to write a composition, how a clause is specified and content-addressed, and how first-write-wins registries and the coordinator pattern preserve the kernel's equilibrium.",
                keywords: ["protocol composition", "clause design", "coordinator pattern", "invariant-preserving composition", "content-addressed identity"],
                industries: ["Builders"],
            },
        ],
    },
    {
        slug: "philosophy-law-ethics",
        disciplineIndex: 4,
        name: "Philosophy, Law and Ethics",
        discipline: "Contract theory · evidence law · labor law · stateless subjecthood · political philosophy",
        intro: "The normative layer: any choice of coordination objective is a subjective choice, so whose values a system encodes, the accountability of its designers, and the ethics of decision algorithms in social systems come before the engineering.",
        definition: "A Figaro commitment is a signed contract: payment = consideration, clauses = terms and conditions, agreementHash = the contract document. Settlement happens on-chain by nature; adjudication happens off-chain by nature; and the primitive's precondition is a cryptographic key rather than civil-legal subjecthood. This group reads the substrate as lawyers, philosophers, and ethicists read it.",
        papers: [
            {
                title: "On-Chain Evidence, Off-Chain Adjudication",
                href: "/papers/on-chain-evidence",
                summary: "Resolution is on-chain by nature and adjudication off-chain by nature. The five-layer stack, the evidentiary properties of what the chain holds, and how eIDAS, the Federal Rules of Evidence, and UNCITRAL already receive it.",
                keywords: ["electronic evidence", "smart-contract law", "dispute resolution", "blockchain evidence", "eIDAS", "UNCITRAL", "jurisdictional flexibility"],
                industries: ["Legal and dispute resolution"],
            },
            {
                title: "The Wallet as Legal Subject",
                href: "/papers/wallet-legal-subject",
                summary: "Employment law classifies workers by subordination. Where the parties are bonded counterparties there is no employment relation to classify: the wallet is property and party at once, self-owned, and the doctrine's threshold contest does not arise.",
                keywords: ["labor law", "employee classification", "gig economy", "private government", "subordination", "legal subject", "self-sovereign identity"],
                industries: ["Platform work", "Legal and dispute resolution"],
            },
            {
                title: "Coercion as a Substrate Variable",
                href: "/papers/coercion-variable",
                summary: "Law has always paired texts with a coercive apparatus. The bonded commitment enforces bilateral commerce with no third party applying force: a pre-commitment, self-binding at consent, that leaves a defector's bond locked.",
                keywords: ["coercion", "sovereignty", "monopoly on violence", "pre-commitment", "bonded enforcement", "political philosophy", "Hobbes", "Weber", "Hart", "boundary of state authority"],
                industries: ["Legal and dispute resolution"],
            },
            {
                title: "The Disclosure Asymmetry: Cryptoeconomic Mechanism Design and the Engineering of Consent",
                href: "/papers/the-disclosure-asymmetry",
                summary: "Consent engineering and mechanism design use the same instruments pointed opposite ways. The operation that reverses the vector is disclosure: published, deterministic rules make the participant who models the mechanism the source of trust, not its victim.",
                keywords: ["mechanism design", "engineering of consent", "manufacture of consent", "disclosure", "common knowledge", "legitimacy", "platform capitalism", "surveillance capitalism", "trust"],
                industries: ["Platforms"],
            },
            {
                title: "Code Is Constitution: The Entrenched Layer Beneath Enactment",
                href: "/papers/code-is-constitution",
                summary: "Not code is law but code is constitution: the entrenched procedural layer beneath enactment. Courts consume the protocol's evidence rather than operate its core, and the right regulatory demand is neutrality of procedure, since there is no entity to regulate.",
                keywords: ["constitutional political economy", "code is law", "lex cryptographia", "credible neutrality", "legality", "lex mercatoria", "decentralized protocols", "entrenchment"],
                industries: ["Regulation and licensing", "Legal and dispute resolution"],
            },
        ],
    },
    {
        slug: "political-science-governance",
        disciplineIndex: 5,
        name: "Political Science, Institutional Economics and Governance",
        discipline: "Political economy · hegemony · sovereign coordination",
        intro: "The meso-institutional level: who gets to make which decisions, under which circumstances, accountable to whom, and how that changes over time — automation in socioeconomic systems as algorithmic policy-making.",
        definition: "The kernel is ideologically agnostic; the graph is the politics. A market-liberal assembly, a cooperative assembly, an Islamic-finance assembly, and a mutual-aid assembly all use the same kernel. This group reads the substrate as political theorists read it — Gramsci, Arendt, post-hegemony: what governance is when the primitive refuses to take positions, and what a capacity to have commerce amounts to with no polity behind it.",
        papers: [
            {
                title: "The Wallet Without a Polity",
                href: "/papers/wallet-without-polity",
                summary: "The precondition is a key, not civil subjecthood. What the bonded commitment means for refugees, the stateless, and populations outside stable banking and enforcement, and what capital they must hold to bond at all.",
                keywords: ["statelessness", "refugee economies", "displaced populations", "the wallet as legal subject", "Arendt", "humanitarian economics", "commerce-without-recognition"],
                industries: ["Humanitarian"],
            },
            {
                title: "The Subordination Variable",
                href: "/papers/subordination-variable",
                summary: "Socialist and capitalist traditions agree that the wage relation is the central fact. A bonded wallet is producer, means of production, and party at once, so the transfer of control never has to be specified, and coordination rent stops recurring.",
                keywords: ["political economy", "subordination", "coordination rent", "associated production", "classical liberalism", "frame collapse", "conditionality of the left/right partition"],
                industries: ["Platform work"],
            },
            {
                title: "The Visibility of Coordination",
                href: "/papers/visibility-of-coordination",
                summary: "“Strangers need a platform” has become common sense in Gramsci's sense. Separating the coordination function from the entities that perform it makes it visible and opens the organizational space, of which the firm is one pattern.",
                keywords: ["cultural hegemony", "Gramsci", "platform economy", "political economy of infrastructure", "coordination substrate", "paradigm shift"],
                industries: ["Platforms"],
            },
            {
                title: "The Ungoverned Substrate",
                href: "/papers/ungoverned-substrate",
                summary: "A third option beside the network state and on-chain governance: a substrate that is itself not governed at all, on which network states, DAOs, cooperatives, sole traders, and agent coalitions can all be constituted.",
                keywords: ["network state", "blockchain governance", "lex cryptographica", "ungoverned substrate", "decentralized autonomous organization", "governance at the graph"],
                industries: ["DAOs and governance"],
            },
            {
                title: "Corridors Without a Hegemon: Bonded Settlement as Common Infrastructure Beneath Rival Trade Corridors",
                href: "/papers/corridors-without-a-hegemon",
                summary: "Belt and Road and IMEC contest who controls the corridor. The physical layer stays with whoever finances it; the coordination layer need not, and an ownerless one cannot be weaponized by either bloc.",
                keywords: ["weaponized interdependence", "hegemony", "Belt and Road Initiative", "IMEC", "infrastructure power", "cooperation under anarchy", "ownerless settlement"],
                industries: ["Cross-border trade"],
            },
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
            {
                title: "Bookkeeping as Protocol Byproduct: Self-Closing Ledger Periods",
                href: "/papers/self-closing-ledger-periods",
                summary: "The process is an accounting entity: born at the first commitment, equity always zero, closed by the buyer's call. Its books are a byproduct of the trade, and e-invoicing under EN 16931 reads straight off them.",
                keywords: ["bookkeeping", "accounting", "auditing", "double-entry", "triple-entry", "escrow accounting", "audit assertions", "Pacioli", "e-invoicing", "EN 16931"],
                industries: ["Accounting and audit", "E-invoicing and tax"],
            },
            {
                title: "Substrate-Broadening Retroactive Public-Goods Funding",
                href: "/papers/substrate-broadening-rpgf",
                summary: "How 600 million florins pay clause and assembly designers after the fact: nine annual periods with rising budgets, usage counted on chain as it happens, breadth over volume, and Sybil resistance from a two-sided live stake.",
                keywords: ["retroactive public goods funding", "mechanism design", "resource allocation", "verified usage accounting", "permissionless recording", "deterministic allocation", "clause authoring", "assembly design", "coordination protocols"],
                industries: ["Tokens and treasuries", "Builders"],
            },
        ],
    },
    {
        slug: "ai-optimization-control",
        disciplineIndex: 7,
        name: "AI, Optimization and Control Theory",
        discipline: "Agent coordination · allocation · control of the mesh",
        intro: "Steering and stability: encoding a coordination objective as a cost function and designing for dynamic stability around it, with the multiscale dynamics that link individual decisions to system-level outcomes.",
        definition: "Agent-mediated coordination over bonded commitments: the kernel's actor-neutrality property turns them into the missing enforcement layer for mutually-untrusted multi-agent systems. This group reads the substrate as control theorists and multi-agent-systems people read it; the Agent SDK at the runtime tier (FigaroContext, proposer, policy gateway, executor) is the operational realization the paper reads back as control.",
        papers: [
            {
                title: "Actor-Neutral Coordination over Bonded Commitments",
                href: "/papers/actor-neutral-coordination",
                summary: "The kernel reads signatures and bond posture, never the kind of entity behind a key, so people and software coordinate on the same footing, with the bond as the enforcement layer that market design and control theory both lacked.",
                keywords: ["multi-agent coordination", "bonded commitment", "control theory", "actor-neutrality", "autonomous agents", "AI agent design", "human-in-the-loop"],
                industries: ["AI agents"],
            },
        ],
    },
    {
        slug: "psychology-decisions",
        disciplineIndex: 8,
        name: "Psychology and Decisions Science",
        discipline: "Behavioral game theory · incentive legibility · interface cognition",
        intro: "How individuals actually decide, given knowledge of the rules and uncertainty about the decisions of others; the security of any incentive system depends on how people respond to incentives — an empirical question, not a theorem.",
        definition: "How participants read a bonded equilibrium under uncertainty, and how legible the incentive structure is to a non-specialist. This group reads the substrate as behavioral game theorists and decision scientists read it — what the comparison at a party's own node actually asks of them, and where the experimental literature on coordination failure does and does not carry over.",
        papers: [
            {
                title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment",
                href: "/papers/behavioral-game-theory",
                summary: "How the equilibrium argument fares with loss-averse, boundedly rational, stranger-wary people: the payoffs straddle the reference point, so loss aversion weights defection alone, and the coordination-failure results cut in the mechanism's favour.",
                keywords: ["behavioral game theory", "loss aversion", "prospect theory", "weakest-link coordination", "peer pressure", "incentive legibility", "mechanism design", "experimental economics", "interface cognition"],
                industries: [],
            },
            {
                title: "External Events and the Settlement Frame: One Rule for Everything the World Does Between the Two Calls",
                href: "/papers/external-events",
                summary: "Between commit and resolve the world goes on. Any occurrence that changes what the parties want the resolution to be is squared before the terminal call, with at most one transfer per order, and the buyer's comparison is unchanged.",
                keywords: ["external events", "settlement frame", "discretionary and deterministic decision", "incomplete contracts", "unforeseen contingencies", "renegotiation", "private ordering", "netting completeness", "bonded commitment", "decision science"],
                industries: [],
            },
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

/** URL slug for an index entry: lowercase, letters and digits, hyphens between. */
export function tagSlug(label: string): string {
    return label
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

/** Every paper with its discipline, flattened from the groups. */
function allPapers(): Array<PaperRef & { group: PaperGroup }> {
    return PAPER_GROUPS.flatMap((group) => group.papers.map((p) => ({ ...p, group })));
}

/** One index entry: the label as written, its slug, and the papers under it. */
export interface TagEntry {
    label: string;
    slug: string;
    papers: Array<PaperRef & { group: PaperGroup }>;
}

/** The index, derived from the registry: `for` = industries, `on` = keywords.
 *  Sorted by label; a label's slug is stable across renders. */
export function tagIndex(kind: "for" | "on"): TagEntry[] {
    const byLabel = new Map<string, TagEntry>();
    for (const p of allPapers()) {
        const labels = kind === "for" ? p.industries : p.keywords;
        for (const label of labels) {
            const slug = tagSlug(label);
            const entry = byLabel.get(slug) ?? { label, slug, papers: [] };
            entry.papers.push(p);
            byLabel.set(slug, entry);
        }
    }
    return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Resolve one index entry by slug, or null. */
export function tagEntry(kind: "for" | "on", slug: string): TagEntry | null {
    return tagIndex(kind).find((t) => t.slug === slug) ?? null;
}

/** A paper page's own registry row, by `/papers/<slug>` folder name. */
export function getPaperRef(slug: string): PaperRef | null {
    const href = `/papers/${slug}`;
    return allPapers().find((p) => p.href === href) ?? null;
}
