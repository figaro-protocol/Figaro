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
     *  PDF (`/papers/<name>.pdf`) for one still written in LaTeX. */
    href: string;
    /** The paper's keywords, in the paper's own order. The paper page reads
     *  them from here; nothing carries a second copy. Each keyword is an
     *  index entry (`/working-groups/on/<slug>`). */
    keywords: string[];
    /** The reader's index: the industries or fields a reader arrives from
     *  for which this paper is a starting point (`/working-groups/for/<slug>`).
     *  Empty when the paper is theory with no such doorway. */
    industries: string[];
    /** The one line the index shows under the title: what the paper asks,
     *  in one short sentence a reader can carry to a first meeting. */
    question: string;
    /** What the paper establishes, in one sentence, at its claim type (a
     *  theorem as proved, a hypothesis as a hypothesis, an argument as
     *  argued). A citation of the equilibrium carries its bound: for any
     *  number of orders the network resolves in one call. */
    result: string;
    /** What the result assumes: actors, information, the mechanisms it
     *  relies on, and where it stops. A statement of scope, never a list of
     *  open questions. */
    scope: string;
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
    /** The project-specific paragraph: what this discipline addresses in Figaro. */
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
        definition: "What a market can be built out of, once the standing firm is no longer the uniquely efficient unit of production. The papers here ask what economists and game theorists ask — the bonding equilibrium and its extension from two parties to N, institutional form, market formation, monetary design.",
        papers: [
            {
                title: "Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers",
                href: "/papers/asymmetric-bonding",
                keywords: ["mechanism design", "subgame-perfect equilibrium", "Nash equilibrium", "asymmetric bonding", "multi-party coordination", "N-party processes", "peer enforcement"],
                industries: [],
                question: "Can a promise between strangers, one buyer and many sellers, hold before the trade?",
                result: "Proved: performing and resolving are strict best responses at every order; atomic resolution puts sellers in a weakest-link subgame favoring performance.",
                scope: "One buyer and its sellers; goods stay off-chain; commit and resolve only, no timeout; one denomination; parties beyond each other's coercive reach.",
            },
            {
                title: "Markets Without a Venue: Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Mechanism",
                href: "/papers/markets-without-a-venue",
                keywords: ["market design", "auction theory", "matching theory", "procurement", "posted prices", "offer formation", "sealed-bid", "reserve price", "bonded commitment"],
                industries: ["Procurement", "Marketplaces"],
                question: "With no venue, how can a buyer ask many sellers yet bind only one?",
                result: "Signing last holds the buyer to one chosen commitment; first price is forced; participation turns on a stated balance; equilibrium is inherited.",
                scope: "One buyer, candidates already found by their published terms, one position at a time; discovery and its cost lie outside the model.",
            },
            {
                title: "The Graph Layer: Economic Form Read from Signed Data Under the Open-World Assumption",
                href: "/papers/the-graph-layer",
                keywords: ["open-world assumption", "closed-world assumption", "buyer-seller networks", "economic networks", "derived meaning", "token gating", "polycentric governance", "embeddedness"],
                industries: ["Marketplaces", "Platforms"],
                question: "Without a roster kept over the trade, where does a trade's form live?",
                result: "Argued: role, market, community and chosen law derive from signed data, read open-world; no stored reading gates a trade.",
                scope: "Readings: what the mechanism enforces is fixed; a declaration's truth is its signer's; equilibrium for parties beyond each other's coercive reach.",
            },
            {
                title: "From Firms to Transaction-Scoped Institutions",
                href: "/papers/transaction-scoped-institutions",
                keywords: ["transaction-cost economics", "theory of the firm", "subordination", "coordination economics", "two-sided markets", "organizational substrate", "institutional economics"],
                industries: ["Firms and strategy"],
                question: "What remains of the firm once bonds make strangers' promises good before trade?",
                result: "A transaction-scoped institution displaces the firm below a recurrence threshold, and court and forum where gas, time value and standoff cost less.",
                scope: "Cost shapes stated, not measured; each party must bond its own order; the buyer must judge the outcome; sunk-investment hold-up is unpriced.",
            },
            {
                title: "Coordination Substrates: Firm, Court, and Bond",
                href: "/papers/coordination-substrates",
                keywords: ["comparative institutional analysis", "discriminating alignment", "transaction cost economics", "contract enforcement", "two-sided markets", "private ordering", "bonded commitment", "institutional substrates", "regulatory reporting", "unit of account"],
                industries: ["Regulation and licensing", "E-invoicing and tax", "Platforms"],
                question: "Firm, platform, court or bond: which makes a stranger's promise good at least cost?",
                result: "Between remote strangers the bond is cheapest below recurrence, duration and value thresholds, and alone serves parties no legal order recognizes.",
                scope: "Analytic: ten axes, four stated cost shapes, no field data; the buyer judges the outcome; the firm touched only at make-or-buy.",
            },
            {
                title: "The Florin: A Schelling-Point Token Issued at Zero",
                href: "/papers/florin-schelling-point-token",
                keywords: ["cryptoeconomics", "Schelling point", "focal-point coordination", "token design", "Howey test", "securities regulation", "MiCA", "sufficiently decentralized", "disclosure", "no central operator", "fixed supply cap"],
                industries: ["Tokens and treasuries"],
                question: "Under the securities tests, what is a token issued at zero after the work?",
                result: "On the mint path each Howey question fails; both legs of sufficient decentralization hold at genesis; what remains is a Schelling point.",
                scope: "A free genesis allocation and a designers' reserve minted on counted use; Howey, Hinman and EU regulation; whether strangers converge is open.",
            },
            {
                title: "Self-Authenticating Data Sales: Arrow's Information Paradox Under the Bonded Commitment",
                href: "/papers/self-authenticating-data-sales",
                keywords: ["information paradox", "mechanism design", "merkle proofs", "data markets", "asymmetric bonding", "disclosure", "repeated games"],
                industries: ["Data markets"],
                question: "Does Arrow's information paradox still bar a first data sale between strangers?",
                result: "Shown by construction: the buyer's valuation cancels; provenance verifies by recomputation; shipping less than described leaves the seller out of pocket.",
                scope: "One transaction, not third parties' correlated data; recomputation shows who committed or attested bytes, never their truth; a residual valuation risk remains.",
            },
            {
                title: "Figaro: Compositional Market Design. A Blockchain-Secured Market for Logistic Services",
                href: "/papers/figaro-2023-compositional-market-design.pdf",
                keywords: ["compositional market design", "logistics", "proof of action", "proof of stake", "token minting"],
                industries: ["Logistics"],
                question: "How is a market for logistic services secured by a blockchain and composed from the parts of a delivery, with no platform holding it together?",
                result: "Proposed, in the revised version: the founding design revised and generalized from last-mile delivery to logistic services; the project's second formulation, kept whole.",
                scope: "A design document of its date, reproduced as written and never revised: its vocabulary predates the lexicon, and nothing in it describes the present mechanism.",
            },
        ],
    },
    {
        slug: "industrial-systems-engineering",
        disciplineIndex: 2,
        name: "Industrial and Systems Engineering",
        discipline: "Process modeling · supply-chain coordination",
        intro: "The system as a designed whole: complex adaptive networks whose collective behavior cannot be inferred from individual actions, and resilient protocol design that accounts for the network's spatial and temporal dynamics.",
        definition: "How bonded commitments compose into multi-party processes with auditable handoffs, lifecycle attestation, and proximity proof. The papers here ask what process and supply-chain engineers ask, worked through on two sectors that already coordinate at scale — air service, and container shipping after TradeLens.",
        papers: [
            {
                title: "Figaro as a Cryptoeconomic System",
                href: "/papers/figaro-as-a-cryptoeconomic-system",
                keywords: ["cryptoeconomics", "cryptoeconomic systems", "two-sided markets", "transaction costs", "purpose-driven tokens", "institutional economics"],
                industries: [],
                question: "In which frame does the whole of Figaro hold together, and why only there?",
                result: "Argued: every part fits the field's three definitions; any other axis leaves one unplaced or puts a party over the system.",
                scope: "Definitions as the field states them; the equilibrium as proved, not observed; parties beyond each other's coercive reach; the governed chain inherited.",
            },
            {
                title: "Air Service as Coordinated Resource Markets",
                href: "/papers/air-service-coordination",
                keywords: ["scheduled-service coordination", "supply-chain coordination", "process modeling", "resource markets", "weakest-link coordination", "industrial engineering"],
                industries: ["Air service", "Procurement"],
                question: "Can a flight's resource markets run as one bonded process that the passenger resolves?",
                result: "Atomic resolution gives each provider a reason to remedy a disruption first; on a $250 journey the passenger bonds $500, providers $3,512.",
                scope: "Parties beyond each other's coercive reach; public authorities as wallets are a declared thought experiment; regulators and passenger protections stay in place.",
            },
            {
                title: "After TradeLens: A Permissionless Bonded Replacement",
                href: "/papers/after-tradelens",
                keywords: ["container shipping", "supply-chain coordination", "bills of lading", "Incoterms", "MLETR", "transferable records", "process modeling"],
                industries: ["Container shipping", "Freight and customs"],
                question: "Why did TradeLens fail, and what coordinates the same shipping parties without its shape?",
                result: "A carrier-controlled platform asks rivals to ratify that control; a published bonded composition, signed one order at a time, does not.",
                scope: "Parties beyond each other's coercive reach; the importer is the one buyer; customs decides clearance off-chain; ports keep their market power.",
            },
            {
                title: "Figaro: A Proof of Delivery Blockchain Solution to the Last Mile Problem",
                href: "/papers/figaro-2022-proof-of-delivery.pdf",
                keywords: ["last-mile delivery", "proof of action", "proof of stake", "token minting", "decentralized market"],
                industries: ["Logistics"],
                question: "Can last-mile delivery be organized as a community market secured by a blockchain, rather than by a platform that keeps most of the price?",
                result: "Proposed, in the founding paper: a market in which a proved delivery is work rewarded by minting and the community regulates itself; the project's origin, kept whole, and the predecessor of the bonded mechanism.",
                scope: "A design document of its date, reproduced as written and never revised: its vocabulary predates the lexicon, and nothing in it describes the present mechanism.",
            },
        ],
    },
    {
        slug: "computer-science-cryptography",
        disciplineIndex: 3,
        name: "Computer Science and Cryptography",
        discipline: "Cryptographic primitives · adversarial review · formal verification · protocol composition · runtime architecture",
        intro: "Economic policies embedded in software: protocol and smart-contract code as the rule layer, cryptographic tools combined with economic incentives so that the cost of wrongdoing is disproportionate to its benefit.",
        definition: "Two complementary lenses on the protocol's CS surface: what stands above the mechanism as a research object — the composition doctrine, clause design as a discipline, the coordinator pattern — and the contract read adversarially, asking where an invariant would break and what proves that it does not. The papers here ask what engineers, cryptographers and verification people ask; the implementation work itself — clause authoring, contract development, assembly composition, frontend — organizes on Clauses and Assemblies.",
        papers: [
            {
                title: "What Formal Verification Transfers to a Bonded Contract: The Payoff Table as the Specification, and What No Check Reaches",
                href: "/papers/verified-resolution-kernel",
                keywords: ["smart contracts", "formal verification", "mechanized proof", "mechanism design", "specification", "verification scope"],
                industries: ["Security and audit"],
                question: "What does a machine check of a bonded contract establish about its equilibrium?",
                result: "Argued: conservation and solvency admit equilibrium-breaking contracts; the bond schedule and the resolution's transfers pin the payoff table, any process length.",
                scope: "Names no tool or run; never reaches rationality, off-chain performance, equilibrium selection, or a composed contract's added payoffs.",
            },
        ],
    },
    {
        slug: "philosophy-law-ethics",
        disciplineIndex: 4,
        name: "Philosophy, Law and Ethics",
        discipline: "Contract theory · evidence law · labor law · stateless subjecthood · political philosophy",
        intro: "The normative layer: any choice of coordination objective is a subjective choice, so whose values a system encodes, the accountability of its designers, and the ethics of decision algorithms in social systems come before the engineering.",
        definition: "A Figaro commitment is a signed contract: payment = consideration, clauses = terms and conditions, checkoutHash = the merkle root of the filled agreement. Resolution happens on-chain by nature; adjudication happens off-chain by nature; and the mechanism asks for a signing key and a bond where commerce asked for civil-legal recognition. The papers here ask what lawyers, philosophers, and ethicists ask.",
        papers: [
            {
                title: "On-Chain Evidence, Off-Chain Adjudication",
                href: "/papers/on-chain-evidence",
                keywords: ["electronic evidence", "smart-contract law", "dispute resolution", "blockchain evidence", "eIDAS", "UNCITRAL", "jurisdictional flexibility"],
                industries: ["Legal and dispute resolution"],
                question: "Should a bonded mechanism adjudicate disputes on chain, or leave evidence forums can use?",
                result: "Argued: commit and resolve leave byproducts and attestations, which existing electronic-evidence law admits and weighs differently, so no adjudicator belongs on chain.",
                scope: "Legal readings for counsel to test, not advice; four evidence frameworks and the New York Convention; a forum rules but never resolves.",
            },
            {
                title: "The Wallet as Legal Subject",
                href: "/papers/wallet-legal-subject",
                keywords: ["labor law", "employee classification", "gig economy", "private government", "subordination", "legal subject", "self-sovereign identity"],
                industries: ["Platform work", "Legal and dispute resolution"],
                question: "What do subordination tests find when exchange runs as bonded commitments between wallets?",
                result: "Argued: no party directs another, so tests find nothing to classify; an asset whose operator holds its key is res and persona.",
                scope: "Doctrine still reaches employment-shaped relations and layers that rebuild a platform; the leveling reaches only those who can bond and hold keys.",
            },
            {
                title: "The Coercion Variable",
                href: "/papers/coercion-variable",
                keywords: ["coercion", "sovereignty", "monopoly on violence", "pre-commitment", "remoteness", "political philosophy", "Hobbes", "Weber", "Hart", "boundary of state authority"],
                industries: ["Legal and dispute resolution"],
                question: "Can a promise between strangers be made good before the trade without force?",
                result: "Argued: between remote parties, bonds locked at consent exercise neither power nor authority, so the question of legitimate coercion is vacated there.",
                scope: "Priceable, bilateral, voluntary trade between parties beyond each other's reach; criminal harm, externalities, public goods, rights and defense stay with the sovereign.",
            },
            {
                title: "The Disclosure Asymmetry: Cryptoeconomic Mechanism Design and the Engineering of Consent",
                href: "/papers/the-disclosure-asymmetry",
                keywords: ["mechanism design", "engineering of consent", "manufacture of consent", "disclosure", "common knowledge", "legitimacy", "platform capitalism", "surveillance capitalism", "trust"],
                industries: ["Platforms"],
                question: "Are consent-engineering and mechanism design one instrument, and what sets its sign?",
                result: "One variable, the participant's accuracy about the mechanism, sets the sign: low accuracy serves consent-engineering, high accuracy a public, deterministic mechanism.",
                scope: "Grants the platform critique's diagnosis; disclosure suffices only with binding rules and ends left to the parties; Figaro is the worked instance.",
            },
            {
                title: "Code Is Constitution: The Entrenched Layer Beneath Enactment",
                href: "/papers/code-is-constitution",
                keywords: ["constitutional political economy", "code is law", "lex cryptographia", "invariants", "abstraction", "legality", "rule of recognition"],
                industries: ["Regulation and licensing", "Legal and dispute resolution"],
                question: "Which layer of rules does a protocol's code occupy, if not law?",
                result: "Argued: a sufficiently abstract protocol secures any economic system composed over it and gives the constitutional language of its laws.",
                scope: "One two-operation protocol, parties beyond coercive reach; honest disagreement, state law and capture of the chain beneath stay outside the claim.",
            },
        ],
    },
    {
        slug: "political-science-governance",
        disciplineIndex: 5,
        name: "Political Science, Institutional Economics and Governance",
        discipline: "Political economy · hegemony · sovereign coordination",
        intro: "The meso-institutional level: who gets to make which decisions, under which circumstances, accountable to whom, and how that changes over time — automation in socioeconomic systems as algorithmic policy-making.",
        definition: "The mechanism is ideologically agnostic; the graph is the politics. A market-liberal assembly, a cooperative assembly, an Islamic-finance assembly, and a mutual-aid assembly all use the same mechanism. The papers here ask what political theorists ask — Gramsci, Arendt, post-hegemony: what governance is when the mechanism refuses to take positions, and what a credible promise amounts to with no polity behind it.",
        papers: [
            {
                title: "The Wallet Without a Polity",
                href: "/papers/wallet-without-polity",
                keywords: ["statelessness", "refugee economies", "displaced populations", "consideration", "Arendt", "humanitarian economics", "commerce without recognition"],
                industries: ["Humanitarian"],
                question: "What do a key and a bond offer people beyond recognition, banking and courts?",
                result: "Argued: between strangers consideration fails, and a bonded commitment makes it hold through two acts no state is asked about.",
                scope: "Parties beyond each other's coercive reach who can lock a bond; legality, forums and status stay the state's; eight operational constraints remain.",
            },
            {
                title: "The Subordination Variable",
                href: "/papers/subordination-variable",
                keywords: ["political economy", "subordination", "coordination rent", "free association", "classical liberalism", "relocation", "conditionality of the left/right partition"],
                industries: ["Platform work"],
                question: "What is left of the Marxian-liberal partition under a mechanism with no wage relation?",
                result: "No one directs a seller and no intermediary takes rent, so both traditions describe it accurately; their partition relocates to the graph.",
                scope: "A party needs wealth to bond; the property baseline is the law's; distribution, public goods and participation are decided in the graph.",
            },
            {
                title: "The Visibility of Coordination",
                href: "/papers/visibility-of-coordination",
                keywords: ["cultural hegemony", "Gramsci", "platform economy", "political economy of infrastructure", "coordination substrate"],
                industries: ["Platforms"],
                question: "Which beliefs about coordinating strangers rule as Gramscian common sense, and what exposes them?",
                result: "Platform, firm and state rails carry one hegemonic belief: promises are made good after the fact. Bonds posted beforehand make it visible.",
                scope: "A diagnosis, not a prediction: it uses part of the mechanism, makes substitution conceivable, and turns the diagnostic on its proposers.",
            },
            {
                title: "The Ungoverned Substrate",
                href: "/papers/ungoverned-substrate",
                keywords: ["network state", "blockchain governance", "holacracy", "cypherpunk", "d/acc", "Ethereum Foundation mandate", "ex ante", "ungoverned substrate", "governance at the graph"],
                industries: ["DAOs and governance"],
                question: "Must the alternative to state coordination of commerce be a governed body?",
                result: "Six programs make promises good after the fact, which needs a seat; a bonded substrate decides nothing afterward, so needs none.",
                scope: "The substrate alone: the chain beneath stays governed; criminal law, public goods and defense stay with the polity; frames compared, not merits.",
            },
            {
                title: "Corridors Without a Hegemon: The Substrate as Common Infrastructure Beneath Rival Trade Corridors",
                href: "/papers/corridors-without-a-hegemon",
                keywords: ["weaponized interdependence", "hegemony", "Belt and Road Initiative", "IMEC", "infrastructure power", "cooperation under anarchy", "permissionless substrate"],
                industries: ["Cross-border trade"],
                question: "Must choosing a corridor mean choosing whose chokepoint your trade coordination sits behind?",
                result: "Argued: a corridor's coordination layer can rest on a permissionless substrate with no hub, so it stops being the sponsor's chokepoint.",
                scope: "Rails, ramps, the chain beneath and any issuer that can block addresses stay governed; states keep their law over residents.",
            },
        ],
    },
    {
        slug: "operations-research",
        disciplineIndex: 6,
        name: "Operations Research and Management Science",
        discipline: "Resource allocation · accounting · ledger design",
        intro: "Allocation made operational: physical, financial, and social resources allocated among stakeholders with unique preferences, information, and capabilities — and the coordination and scaling of those allocation decisions.",
        definition: "A Figaro process is a self-closing ledger period. Commits are journal entries; resolution is the closing entry; the merkle root of each order's agreement is its contract document. The papers here ask what operations researchers and accountants ask — the mechanism as an accounting primitive, the process topology as a coordination problem, the closure as a scheduling invariant.",
        papers: [
            {
                title: "Bookkeeping as Protocol Byproduct: Self-Closing Ledger Periods",
                href: "/papers/self-closing-ledger-periods",
                keywords: ["bookkeeping", "accounting", "auditing", "double-entry", "triple-entry", "trust accounting", "audit assertions", "Pacioli", "e-invoicing", "EN 16931"],
                industries: ["Accounting and audit", "E-invoicing and tax"],
                question: "What is a bonded process in accounting terms, and what work does it leave?",
                result: "A zero-equity accounting entity whose commitments are journal entries and whose buyer's resolution zeroes every account; bookkeeping and the close become byproduct.",
                scope: "The accounts of one process only, never performance or the parties' own books; interpretation and the audit against the world continue.",
            },
            {
                title: "Substrate-Broadening Retroactive Public-Goods Funding",
                href: "/papers/substrate-broadening-rpgf",
                keywords: ["retroactive public goods funding", "mechanism design", "resource allocation", "verified usage accounting", "permissionless counting", "deterministic allocation", "clause design", "assembly design", "coordination protocols"],
                industries: ["Tokens and treasuries", "Builders"],
                question: "How can a fixed florin reserve reward designers with no committee and no oracle?",
                result: "Each share is score over the total, with score c^(1/3)·d^(2/3); weights are inert or judgment; fabrication costs linearly, capture convexly.",
                scope: "Counts uses on chain at resolution, gated by live stakes on both sides; rewards clause, agreement and assembly design; optimizes no welfare.",
            },
        ],
    },
    {
        slug: "ai-optimization-control",
        disciplineIndex: 7,
        name: "AI, Optimization and Control Theory",
        discipline: "Agent coordination · allocation · control of the mesh",
        intro: "Steering and stability: encoding a coordination objective as a cost function and designing for dynamic stability around it, with the multiscale dynamics that link individual decisions to system-level outcomes.",
        definition: "Agent-mediated coordination over bonded commitments: a substrate that reads signatures and bonds, never the kind of entity behind a key, is the layer that makes a promise good before the trade, which mutually untrusted multi-agent systems lacked. The papers here ask what control theorists and multi-agent-systems people ask of it.",
        papers: [
            {
                title: "What a Trust Layer for Agents Acting for Principals Needs",
                href: "/papers/actor-neutral-coordination",
                keywords: ["multi-agent coordination", "bonded commitment", "autonomous agents", "principal-agent", "reputation", "legal wrapper", "AI agent design"],
                industries: ["AI agents"],
                question: "What must a trust layer give an agent committing its principal's tokens to strangers?",
                result: "Argued: registries, validator stakes and legal wrappers give neither a promise before the work nor a loss ceiling; a bond gives both.",
                scope: "One commitment, parties beyond each other's coercive reach; bound over many is the agent's policy; recourse against one's agent is the law's.",
            },
        ],
    },
    {
        slug: "psychology-decisions",
        disciplineIndex: 8,
        name: "Psychology and Decisions Science",
        discipline: "Behavioral game theory · incentive legibility · interface cognition",
        intro: "How individuals actually decide, given knowledge of the rules and uncertainty about the decisions of others; the security of any incentive system depends on how people respond to incentives — an empirical question, not a theorem.",
        definition: "How participants read a bonded equilibrium under uncertainty, and how legible the incentive structure is to a non-specialist. The papers here ask what behavioral game theorists and decision scientists ask — what the comparison at a party's own node actually asks of them, and where the experimental literature on coordination failure does and does not carry over.",
        papers: [
            {
                title: "Behavioral Game Theory of the Two-Mechanism Bonded Commitment",
                href: "/papers/behavioral-game-theory",
                keywords: ["behavioral game theory", "loss aversion", "prospect theory", "weakest-link coordination", "peer pressure", "incentive legibility", "mechanism design", "experimental economics", "interface cognition"],
                industries: [],
                question: "Does the bonded equilibrium survive loss-averse, boundedly reasoning, pessimistic participants?",
                result: "Two hypotheses: with separate accounts, loss aversion makes holding out feel 1.29–1.36 times heavier, reversing nothing; one reasoning step checks the equilibrium.",
                scope: "Equilibrium as proved; reference point at pre-commitment wealth; full retention; meta-analytic loss-aversion interval and level-k depth taken as given; unobserved.",
            },
            {
                title: "External Events and the Resolution Frame: One Rule for Everything the World Does Between the Two Calls",
                href: "/papers/external-events",
                keywords: ["external events", "resolution frame", "discretionary and deterministic decision", "incomplete contracts", "unforeseen contingencies", "renegotiation", "private ordering", "netting completeness", "bonded commitment", "decision science"],
                industries: [],
                question: "When something happens between commit and resolution, how do the parties change the outcome?",
                result: "Transfers before resolution reach any zero-sum reallocation, leave the buyer's reason to resolve intact, and bonds make a failing seller's transfer credible.",
                scope: "Parties beyond each other's coercive reach; one token; the parties choose the reallocation; the buyer's own transfers are left to commercial reason.",
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
