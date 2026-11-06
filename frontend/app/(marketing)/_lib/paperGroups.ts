/** 1–8 — Voshmgir & Zargham's eight disciplines. */
type DisciplineIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Disciplinary grouping ("registry" was a tier-word homograph; the on-chain registries are the protocol anchors) — Voshmgir & Zargham, "Foundations of Cryptoeconomic
 * Systems" (Working Paper Series 1/2020, Research Institute for Cryptoeconomics,
 * WU Vienna, 2020; §3 + Fig. 2 — the paper:
 * https://research.wu.ac.at/en/publications/foundations-of-cryptoeconomic-systems-6/).
 * Eight disciplines, VERBATIM from the paper's list. The disciplines sort the
 * papers; a working group is an interdisciplinary group of people, the
 * disciplines intersecting, never one group per discipline. The list cannot
 * grow or shrink without departing from the taxonomy.
 *
 * Papers and `venue` are optional. Every
 * discipline always has its paragraph (`intro`); `/working-groups` renders the
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
     *  PDF (`/papers/<name>.pdf`) for one still written in LaTeX. */
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
    /** The one paragraph the index shows under the discipline: the discipline in
     *  Voshmgir & Zargham's own account of a cryptoeconomic system, in the
     *  paper's words (sourced once, via the page footnote). */
    intro: string;
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
        intro: "The micro-foundations: mechanism design as reverse game theory — constructing the game so that the desired behavior is what self-interested actors converge on — tempered by the evolution-of-cooperation result that cooperation among selfish actors is a sufficient condition, not a necessary one.",
        papers: [
            {
                title: "Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers",
                href: "/papers/asymmetric-bonding",
                summary: "The two calls of the mechanism and why they compose: commit locks a bond on each side, resolve closes every order at once on the buyer's signature alone, and at every order a defector is left out of pocket even after crediting what it keeps.",
                keywords: ["mechanism design", "subgame-perfect equilibrium", "Nash equilibrium", "asymmetric bonding", "multi-party coordination", "N-party processes", "peer enforcement"],
                industries: [],
            },
            {
                title: "Markets Without a Venue: Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Mechanism",
                href: "/papers/markets-without-a-venue",
                summary: "How a market forms with no venue holding state: the buyer circulates the unsigned commitment itself, as a dispatch race or a sealed-bid request for quotes; mutual exclusion follows from the sequence of signing, the anti-reneging bond follows in part, and verifiable selection does not, so the price is first price; discovery at scale lies outside the model.",
                keywords: ["market design", "auction theory", "matching theory", "procurement", "posted prices", "offer formation", "sealed-bid", "reserve price", "bonded commitment"],
                industries: ["Procurement", "Marketplaces"],
            },
            {
                title: "The Graph Layer: Economic Form Read from Signed Data Under the Open-World Assumption",
                href: "/papers/the-graph-layer",
                summary: "Above a mechanism that fixes only two bonds and the buyer's resolution, a party's role, its market, its community and the law the parties chose are read from composed clauses, signed topology, holdings and attestations under the open-world assumption, and no stored reading gates a trade.",
                keywords: ["open-world assumption", "closed-world assumption", "buyer-seller networks", "economic networks", "derived meaning", "token gating", "polycentric governance", "embeddedness"],
                industries: ["Marketplaces", "Platforms"],
            },
            {
                title: "From Firms to Transaction-Scoped Institutions",
                href: "/papers/transaction-scoped-institutions",
                summary: "The Coasean collapse: when a bond posted before the trade makes keeping its word each stranger's best reply, for the network's gas and the bond's time value, the institution a trade needs exists for the time of that trade (terms, evidence, books, the bonds that make the promise good, and the close), and what remains of the firm is a legal wrapper around assets that hold their own wallets.",
                keywords: ["transaction-cost economics", "theory of the firm", "subordination", "coordination economics", "two-sided markets", "organizational substrate", "institutional economics"],
                industries: ["Firms and strategy"],
            },
            {
                title: "Coordination Substrates: Firm, Court, and Bond",
                href: "/papers/coordination-substrates",
                summary: "Three ways to make a stranger's promise good, compared in four columns on ten institutional axes: the firm, which internalizes it under hierarchy or routes it through a platform; the court, which hears it afterward; and the parties' own bonds, posted before the trade.",
                keywords: ["comparative institutional analysis", "discriminating alignment", "transaction cost economics", "contract enforcement", "two-sided markets", "private ordering", "bonded commitment", "institutional substrates", "regulatory reporting", "unit of account"],
                industries: ["Regulation and licensing", "E-invoicing and tax", "Platforms"],
            },
            {
                title: "The Florin: A Schelling-Point Token Issued at Zero",
                href: "/papers/florin-schelling-point-token",
                summary: "A token issued at zero after the work, with no central operator and nothing beneath it, taken through the securities tests in a regulator's order: Howey's four questions, the disclosure they exist to compel, sufficiently decentralized on day one, and what is left, a Schelling point.",
                keywords: ["cryptoeconomics", "Schelling point", "focal-point coordination", "token design", "Howey test", "securities regulation", "MiCA", "sufficiently decentralized", "disclosure", "no central operator", "fixed supply cap"],
                industries: ["Tokens and treasuries"],
            },
            {
                title: "Self-Authenticating Data Sales: Arrow's Information Paradox Under the Bonded Commitment",
                href: "/papers/self-authenticating-data-sales",
                summary: "Arrow's paradox for data, answered by the mechanism: a term sold verifies by inclusion proof against the source agreement's root, delivered data by the hash a party attested while the process was open, and the doubled bond leaves a misdescribing seller out of pocket.",
                keywords: ["information paradox", "mechanism design", "merkle proofs", "data markets", "asymmetric bonding", "disclosure", "repeated games"],
                industries: ["Data markets"],
            },
            {
                title: "Figaro: Compositional Market Design. A Blockchain-Secured Market for Logistic Services",
                href: "/papers/figaro-2023-compositional-market-design.pdf",
                summary: "The founding paper's revised version, served as written: retitled toward compositional market design, a blockchain-secured market for logistic services built from Proof of Stake, Proof of Action, and token minting; the second formulation before the bonded mechanism.",
                keywords: ["compositional market design", "logistics", "proof of action", "proof of stake", "token minting"],
                industries: ["Logistics"],
            },
        ],
    },
    {
        slug: "industrial-systems-engineering",
        disciplineIndex: 2,
        name: "Industrial and Systems Engineering",
        discipline: "Process modeling · supply-chain coordination",
        intro: "The system as a designed whole: complex adaptive networks whose collective behavior cannot be inferred from individual actions, and resilient protocol design that accounts for the network's spatial and temporal dynamics.",
        papers: [
            {
                title: "Figaro as a Cryptoeconomic System",
                href: "/papers/figaro-as-a-cryptoeconomic-system",
                summary: "Trade between strangers bears three costs a credible promise would not impose: attracting buyers, handling disputes, and the intermediary's capture of the trade's data. Read against the field's three definitions of a cryptoeconomic system, every part of Figaro has its place, and what emerges is a substrate on which economic forms compose.",
                keywords: ["cryptoeconomics", "cryptoeconomic systems", "two-sided markets", "transaction costs", "purpose-driven tokens", "institutional economics"],
                industries: [],
            },
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
                summary: "Why TradeLens failed as a structure, not as software, and the permissionless alternative at the same perimeter: carriers, ports, customs, forwarders, and financiers each bonded into one import process under Incoterms, handoff, and cold-chain terms.",
                keywords: ["container shipping", "supply-chain coordination", "bills of lading", "Incoterms", "MLETR", "transferable records", "process modeling"],
                industries: ["Container shipping", "Freight and customs"],
            },
            {
                title: "Figaro: A Proof of Delivery Blockchain Solution to the Last Mile Problem",
                href: "/papers/figaro-2022-proof-of-delivery.pdf",
                summary: "The founding paper, served as written: a proof that a good moved from one point to another is evidence of work, so Proof of Stake, Proof of Action, and token minting combine into a community-based, decentralized, self-regulating market for last-mile delivery.",
                keywords: ["last-mile delivery", "proof of action", "proof of stake", "token minting", "decentralized market"],
                industries: ["Logistics"],
            },
        ],
    },
    {
        slug: "computer-science-cryptography",
        disciplineIndex: 3,
        name: "Computer Science and Cryptography",
        discipline: "Cryptographic primitives · adversarial review · formal verification · protocol composition · runtime architecture",
        intro: "Economic policies embedded in software: protocol and smart-contract code as the rule layer, cryptographic tools combined with economic incentives so that the cost of wrongdoing is disproportionate to its benefit.",
        papers: [
            {
                title: "What Formal Verification Transfers to a Bonded Contract: The Payoff Table as the Specification, and What No Check Reaches",
                href: "/papers/verified-resolution-kernel",
                summary: "For a contract whose security is an equilibrium, machine verification transfers the theorem only through a specification that pins the payoff table: conservation and solvency do not pin it, two variants that conserve and stay solvent break the equilibrium, and \"formally verified\" can mean only the conjunction of checks that the code realizes the table and a proof of the equilibrium over it, with the residue no check reaches named.",
                keywords: ["smart contracts", "formal verification", "mechanized proof", "mechanism design", "specification", "verification scope"],
                industries: ["Security and audit"],
            },
        ],
    },
    {
        slug: "philosophy-law-ethics",
        disciplineIndex: 4,
        name: "Philosophy, Law and Ethics",
        discipline: "Contract theory · evidence law · labor law · stateless subjecthood · political philosophy",
        intro: "The normative layer: any choice of coordination objective is a subjective choice, so whose values a system encodes, the accountability of its designers, and the ethics of decision algorithms in social systems come before the engineering.",
        papers: [
            {
                title: "On-Chain Evidence, Off-Chain Adjudication",
                href: "/papers/on-chain-evidence",
                summary: "A bonded mechanism whose only operations are commit and resolve leaves two classes of evidence, resolution byproducts and attestations, which eIDAS, the Federal Rules of Evidence, and the UNCITRAL Model Law admit and the Singapore ETA recognizes, each forum weighing them as the way they were produced warrants. The five-layer stack, and the limit the paper attaches to each reading.",
                keywords: ["electronic evidence", "smart-contract law", "dispute resolution", "blockchain evidence", "eIDAS", "UNCITRAL", "jurisdictional flexibility"],
                industries: ["Legal and dispute resolution"],
            },
            {
                title: "The Wallet as Legal Subject",
                href: "/papers/wallet-legal-subject",
                summary: "Employment law classifies workers by subordination. Under bonded commitments no party holds a power to direct another's work, so the tests find no directive relation to classify; the wallet is the on-chain position of the asset that trades through it, and where its operator holds its own key that position is property and party at once.",
                keywords: ["labor law", "employee classification", "gig economy", "private government", "subordination", "legal subject", "self-sovereign identity"],
                industries: ["Platform work", "Legal and dispute resolution"],
            },
            {
                title: "The Coercion Variable",
                href: "/papers/coercion-variable",
                summary: "Coercion is a variable, not a constant: between parties beyond each other's coercive reach, bonds locked at consent exercise neither its forcing nor its authority component, because performance is each party's best reply to the others' plans and a withheld bond stays locked and reaches no one.",
                keywords: ["coercion", "sovereignty", "monopoly on violence", "pre-commitment", "remoteness", "political philosophy", "Hobbes", "Weber", "Hart", "boundary of state authority"],
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
                summary: "Not code is law but code is constitution: a sufficiently abstract protocol holds a simple set of invariants that secure any economic system composed over it, and the clauses, agreements, and assemblies written over them are the laws, legislated in the constitution's language.",
                keywords: ["constitutional political economy", "code is law", "lex cryptographia", "invariants", "abstraction", "legality", "rule of recognition"],
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
        papers: [
            {
                title: "The Wallet Without a Polity",
                href: "/papers/wallet-without-polity",
                summary: "Between strangers the contract element that fails is consideration, and refugees, stateless people and others beyond stable banking and courts lack what ordinarily makes a promise credible. A bonded commitment makes it credible by two acts no state is asked about, a signature and a bond; the boundary is a bond they can lock.",
                keywords: ["statelessness", "refugee economies", "displaced populations", "consideration", "Arendt", "humanitarian economics", "commerce without recognition"],
                industries: ["Humanitarian"],
            },
            {
                title: "The Subordination Variable",
                href: "/papers/subordination-variable",
                summary: "The cooperative-Marxian and classical-liberal traditions agree that the wage relation divides them. Under a bonded commitment no residual right over a seller's conduct passes to anyone and no intermediary takes a recurring rent, so one artifact admits both readings and the partition relocates to the graph composed above it.",
                keywords: ["political economy", "subordination", "coordination rent", "free association", "classical liberalism", "relocation", "conditionality of the left/right partition"],
                industries: ["Platform work"],
            },
            {
                title: "The Visibility of Coordination",
                href: "/papers/visibility-of-coordination",
                summary: "“Strangers need a platform” has become common sense in Gramsci's sense, and beneath it an older proposition: that a promise is made good only after the fact, by an authority. Separating the coordination function from the entities that perform it makes it visible and opens the organizational space, of which the firm is one pattern. The diagnostic is turned on this arrangement too: compounding, holding, standing, disclosure.",
                keywords: ["cultural hegemony", "Gramsci", "platform economy", "political economy of infrastructure", "coordination substrate"],
                industries: ["Platforms"],
            },
            {
                title: "The Ungoverned Substrate",
                href: "/papers/ungoverned-substrate",
                summary: "Six programs for coordination beyond the state, read in their own words, share the ex-post frame: a stranger's promise made good after the fact, so a seat must decide afterward. A substrate that makes the promise good before the trade leaves no decision after it but each party's over its own trade, has no seat, and can be ungoverned.",
                keywords: ["network state", "blockchain governance", "holacracy", "cypherpunk", "d/acc", "Ethereum Foundation mandate", "ex ante", "ungoverned substrate", "governance at the graph"],
                industries: ["DAOs and governance"],
            },
            {
                title: "Corridors Without a Hegemon: The Substrate as Common Infrastructure Beneath Rival Trade Corridors",
                href: "/papers/corridors-without-a-hegemon",
                summary: "Belt and Road and IMEC contest who controls the corridor. The physical layer stays with whoever finances it; the coordination layer need not: on a decentralized, permissionless substrate with no hub it stops being a chokepoint the corridor's sponsor holds, while the rails, the ramps, the chain beneath, and any issuer that can block addresses stay governed.",
                keywords: ["weaponized interdependence", "hegemony", "Belt and Road Initiative", "IMEC", "infrastructure power", "cooperation under anarchy", "permissionless substrate"],
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
        papers: [
            {
                title: "Bookkeeping as Protocol Byproduct: Self-Closing Ledger Periods",
                href: "/papers/self-closing-ledger-periods",
                summary: "The process is an accounting entity: born at the first commitment, equity always zero, closed by the buyer's call. Its books are a byproduct of the trade, and an EN 16931 invoice projects from each order, its tax elements supplied by the terms.",
                keywords: ["bookkeeping", "accounting", "auditing", "double-entry", "triple-entry", "trust accounting", "audit assertions", "Pacioli", "e-invoicing", "EN 16931"],
                industries: ["Accounting and audit", "E-invoicing and tax"],
            },
            {
                title: "Substrate-Broadening Retroactive Public-Goods Funding",
                href: "/papers/substrate-broadening-rpgf",
                summary: "How a fixed reserve of florins rewards the designers of clauses, agreements, and assemblies after the fact: a fixed run of periods with rising budgets, usage counted on chain as it happens, breadth over volume, and Sybil resistance from a two-sided live stake.",
                keywords: ["retroactive public goods funding", "mechanism design", "resource allocation", "verified usage accounting", "permissionless counting", "deterministic allocation", "clause design", "assembly design", "coordination protocols"],
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
        papers: [
            {
                title: "What a Trust Layer for Agents Acting for Principals Needs",
                href: "/papers/actor-neutral-coordination",
                summary: "An agent acting for a principal needs, from a stranger it has never met, a promise that is good before the work and a ceiling on what one commitment can cost the principal. A reputation registry, a validator's stake over finished work and a legal wrapper each supply neither; a bond locked at commit supplies both, and leaves the aggregate bound to the agent's own policy.",
                keywords: ["multi-agent coordination", "bonded commitment", "autonomous agents", "principal-agent", "reputation", "legal wrapper", "AI agent design"],
                industries: ["AI agents"],
            },
        ],
    },
    {
        slug: "psychology-decisions",
        disciplineIndex: 8,
        name: "Psychology and Decisions Science",
        discipline: "Behavioral game theory · incentive legibility · interface cognition",
        intro: "How individuals actually decide, given knowledge of the rules and uncertainty about the decisions of others.",
        papers: [
            {
                title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment",
                href: "/papers/behavioral-game-theory",
                summary: "How the equilibrium argument fares with loss-averse, boundedly rational, stranger-wary people: the payoffs straddle the reference point, so loss aversion weights defection alone, and the coordination-failure condition is conceded: pessimism buys duration, not a worse outcome.",
                keywords: ["behavioral game theory", "loss aversion", "prospect theory", "weakest-link coordination", "peer pressure", "incentive legibility", "mechanism design", "experimental economics", "interface cognition"],
                industries: [],
            },
            {
                title: "External Events and the Resolution Frame: One Rule for Everything the World Does Between the Two Calls",
                href: "/papers/external-events",
                summary: "Between commit and resolve the world goes on. Any occurrence that changes what the parties want the resolution to be is squared before the terminal call, with fewer transfers than there are parties, and the buyer's comparison is unchanged.",
                keywords: ["external events", "resolution frame", "discretionary and deterministic decision", "incomplete contracts", "unforeseen contingencies", "renegotiation", "private ordering", "netting completeness", "bonded commitment", "decision science"],
                industries: [],
            },
        ],
    },
];

/** Where a paper page sits in the corpus grouping — its discipline plus its
 *  neighbors within that discipline. Drives the `PaperLayout` breadcrumb
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
