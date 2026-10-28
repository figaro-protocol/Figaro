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
    /** The paper's card on `/working-groups`, three lines read from the
     *  paper's abstract and main result. `question`: what the paper asks, in
     *  one sentence. */
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
                title: "Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination",
                href: "/papers/asymmetric-bonding",
                summary: "The two calls of the mechanism and why they compose: commit locks a bond on each side, resolve closes every order at once on the buyer's signature alone, and at every link a defector is left out of pocket even after crediting what it keeps.",
                keywords: ["mechanism design", "subgame-perfect equilibrium", "Nash equilibrium", "asymmetric bonding", "multi-party coordination", "process chains", "peer enforcement"],
                industries: [],
                question: "Can a promise between strangers, and a chain of sellers behind one buyer, be made credible before the trade, with no authority acting after it?",
                result: "Proved: cooperation is the equilibrium for any number of orders the network resolves in one call: after performance resolving is the buyer's strict preference with no assumption about the seller; given the buyer's plan to resolve once performance has occurred and its co-sellers' performance, performing is each seller's strict best response; and atomic resolution puts the sellers in a weakest-link subgame whose selection criteria favor universal performance.",
                scope: "One buyer and sellers who each sign for themselves; the goods and every passage of value stay off-chain, and a defector is credited with all it keeps; commit and resolve are the only calls, with no timeout; one denomination per process; of joint-liability lending it reproduces the coordination-pressure component, not peer selection or peer monitoring.",
            },
            {
                title: "Markets Without a Venue: Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Mechanism",
                href: "/papers/markets-without-a-venue",
                summary: "How a market forms with no venue holding state: the buyer circulates the unsigned commitment itself, as a dispatch race or a sealed-bid request for quotes; mutual exclusion follows from the order of signatures, the anti-reneging stake follows in part, and verifiable selection does not, so the price is first price; discovery at scale lies outside the model.",
                keywords: ["market design", "auction theory", "matching theory", "procurement", "posted prices", "offer formation", "sealed-bid", "reserve price", "bonded commitment"],
                industries: ["Procurement", "Marketplaces"],
                question: "How does one commitment come to carry two signatures when no venue holds the state between the asking and the binding?",
                result: "Proved: a buyer that signs last is held to exactly one commitment of its choosing; in the request for quotes first price is forced and participation turns on a balance the draft states; and a market layer whose only output is a commitment the Core accepts inherits the Core's equilibrium, for any number of orders the network resolves in one call, unchanged.",
                scope: "One buyer and a finite set of candidates it has already found by their published terms; drafts travel over a channel, and nothing holds state between solicitation and commitment; positions form one at a time in commit order; discovery and the cost of reading published terms lie outside the model.",
            },
            {
                title: "From Firms to Transaction-Scoped Institutions",
                href: "/papers/transaction-scoped-institutions",
                summary: "The Coasean collapse: when a stranger's promise enforces itself for the network's gas and the time value of a bond, the institution a trade needs exists for the time of that trade — terms, evidence, books, enforcement, close — and what remains of the firm is a legal wrapper around assets that hold their own wallets.",
                keywords: ["transaction-cost economics", "theory of the firm", "subordination", "coordination economics", "two-sided markets", "organizational substrate", "institutional economics"],
                industries: ["Firms and strategy"],
                question: "What follows for the firm when a stranger's promise enforces itself for the network's gas and the time value of the bonds?",
                result: "A proposition derived from the two proved mechanisms and from stated cost shapes of four governance modes: the bonded process is the cheaper mode where each party can bond its own link, the bonds' time value is small beside the apparatus and litigation it replaces and the buyer can judge the outcome at acceptance; where no legal order reaches both parties it is compared with a forum alone, and where no forum binds both it is the one mode available that does not rest on recurrence; above a recurrence threshold the firm keeps the cell.",
                scope: "Takes the equilibrium as proved, for any number of orders the network resolves in one call; the cost shapes are stated, not measured; what remains of the firm passes to composition only where the productive assets hold their own wallets.",
            },
            {
                title: "Coordination Substrates: Firm, Platform, Court, and Bond",
                href: "/papers/coordination-substrates",
                summary: "Four ways to make a stranger's promise good, compared on ten institutional axes: internalize it in a firm, route it through a platform, leave it to a court, or have the parties bond it themselves before the trade.",
                keywords: ["comparative institutional analysis", "discriminating alignment", "transaction cost economics", "contract enforcement", "two-sided markets", "private ordering", "bonded commitment", "institutional substrates", "regulatory reporting", "unit of account"],
                industries: ["Regulation and licensing", "E-invoicing and tax", "Platforms"],
                question: "Of four substrates (the firm, the platform, the court, and the parties' own bonds), which makes a stranger's promise worth acting on at least cost, and where?",
                result: "A comparison on ten institutional axes, with a discriminating-alignment proposition that follows from the two proved mechanisms and four stated cost shapes: between strangers at low asset specificity and below the firm's recurrence threshold, the bond is cheaper than a platform for a trade of N equal orders whose gas and matching are small beside the take while it stands open less than τ/((N+3)r), and cheaper than a court at small value; for the orders of a party no legal order recognizes it is the only one of the four available, once that party's first tokens reach it; the firm, the platform and the court keep pooled and partitioned assets, thin markets and relief after the fact.",
                scope: "A comparison of substrates, not a theory of the firm; the cost shapes are stated, not measured, and the buyer is taken to judge the outcome when it resolves; the data a platform collects and its power to revoke admission are set aside; for a party no legal order recognizes the claim is about operation, not genesis; the shared infrastructure and any token are left out; analytic throughout.",
            },
            {
                title: "The Florin: A Schelling-Point Token Issued at Zero",
                href: "/papers/florin-schelling-point-token",
                summary: "A token issued at zero after the work, with no central operator and nothing beneath it, taken through the securities tests in a regulator's order: Howey's four questions, the disclosure they exist to compel, sufficiently decentralized on day one, and what is left, a Schelling point.",
                keywords: ["cryptoeconomics", "Schelling point", "focal-point coordination", "token design", "Howey test", "securities regulation", "MiCA", "sufficiently decentralized", "disclosure", "no central operator", "fixed supply cap"],
                industries: ["Tokens and treasuries"],
                question: "What is a token issued at zero, after its economic system was built and with nothing in that system conditioned on it, under the securities tests?",
                result: "Argued in a regulator's order: where a florin first comes to exist, each of Howey's four questions fails and a secondary purchase reopens only the first; the disclosure the tests compel is the public rules and data themselves; the sufficiently-decentralized condition holds on the first day; and what remains is a Schelling point.",
                scope: "The florin's facts as issued: a fixed ceiling; genesis allocations minted at zero, with nothing given for them; a reward reserve minted to designers of record in proportion to counted use; no central operator; Howey, the disclosure regime and MiCA as the tests; whether participants converge on it is a question about strangers, which the design does not answer.",
            },
            {
                title: "Self-Authenticating Data Sales: Arrow's Information Paradox Under the Bonded Commitment",
                href: "/papers/self-authenticating-data-sales",
                summary: "Arrow's paradox for data, answered by the mechanism: a term sold verifies by inclusion proof against the source agreement's root, delivered data by the hash a party attested while the process was open, and the doubled bond leaves a misdescribing seller out of pocket.",
                keywords: ["information paradox", "mechanism design", "merkle proofs", "data markets", "asymmetric bonding", "disclosure", "repeated games"],
                industries: ["Data markets"],
                question: "Does Arrow's information paradox still bar a first sale of data between strangers under a bonded commitment?",
                result: "Shown by economic construction: the appropriation horn closes, because the value a buyer has extracted sits in both its continuations and cancels; the valuation horn is answered by provenance verified against the agreement's merkle root and the attested content hash, with the doubled seller bond leaving misdescription out of pocket.",
                scope: "One transaction and its own data, never the correlated data of third parties; the guarantee is referential, showing that disclosed data is what a named process committed or a named party attested, never that it is true; a no-redistribution term is evidence for a forum, not a control; the buyer keeps a residual valuation risk.",
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
                summary: "Trade between strangers bears three costs a credible promise would not impose: attracting buyers, handling disputes, and the intermediary's capture of the trade's data. Read against the field's three definitions of a cryptoeconomic system, every part of Figaro has its place, and what emerges is a substrate on which economic forms compose.",
                keywords: ["cryptoeconomics", "cryptoeconomic systems", "two-sided markets", "transaction costs", "purpose-driven tokens", "institutional economics"],
                industries: [],
                question: "In which frame does the whole of Figaro hold together, and what does every other axis (the Core alone, the product, the interface, the firm, the platform) bring with it?",
                result: "Cryptoeconomics is the one frame in which the whole holds together: the bond carries the cost of disputes, the cost of attracting buyers moves to a staked listing, the communities and a designer's token, no party in the middle holds the data, and each part has its place under Zamfir's, Buterin's, or Voshmgir and Zargham's definition; every other axis leaves a part without a place or restores a party that stands over the system.",
                scope: "The definitions as the field states them and the equilibrium as proved, not observed; the chain beneath is governed and inherited; the road to the network-state, governance and cypherpunk programs is a possibility the substrate opens, not a prediction.",
            },
            {
                title: "Air Service as Coordinated Resource Markets",
                href: "/papers/air-service-coordination",
                summary: "Air service read as coordination across resource markets: crew, aircraft time, fuel, gates, catering, handling, each provider a wallet, the passenger the buyer of every order, one resolution paying the whole flight.",
                keywords: ["scheduled-service coordination", "supply-chain coordination", "process modeling", "resource markets", "weakest-link coordination", "industrial engineering"],
                industries: ["Air service", "Procurement"],
                question: "Can the resource markets of one flight (crew, aircraft time, fuel, landing slots, catering, maintenance, handling) run as one bonded process the passenger resolves?",
                result: "Worked through as a composition: each provider is a wallet bonded to the passenger as buyer, atomic resolution puts each provider's payment and bond behind every other's performance so the cohort holds its own reason to compensate the passenger first, and on a stylized ten-order journey of $250 the passenger bonds $500 and the providers $3,512.",
                scope: "The equilibrium as proved, for any number of orders the network resolves in one call; one denomination per process, converted before commit; public authorities bonding in is a declared thought experiment on which no result depends; strongest where providers compete, weakest at near-monopolies.",
            },
            {
                title: "After TradeLens: A Permissionless Bonded Replacement",
                href: "/papers/after-tradelens",
                summary: "Why TradeLens failed as a structure, not as software, and the permissionless alternative at the same perimeter: carriers, ports, customs, forwarders, and financiers each bonded into one import chain under Incoterms, handoff, and cold-chain terms.",
                keywords: ["container shipping", "supply-chain coordination", "bills of lading", "Incoterms", "MLETR", "transferable records", "process modeling"],
                industries: ["Container shipping", "Freight and customs"],
                question: "Why did TradeLens fail although carriers covering more than half the world's ocean container cargo had joined it, and what stands at the same perimeter without its shape?",
                result: "Argued: the failure was one of governance shape, since a platform one carrier controls asks its rivals to ratify that carrier's gatekeeping; the permissionless composition, worked through a thirteen-order import, makes every carrier, port, inspector, insurer, and customs authority a seller to the importer.",
                scope: "The importer is the one buyer; the mechanism-design results are restated, not extended, with the equilibrium proved for any number of orders the network resolves in one call; a port's hold on berth windows stays; customs acts off-chain as sovereign; small shippers enter through a forwarder that bonds as the seller.",
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
                summary: "For a contract whose security is an equilibrium, machine verification transfers the theorem only through a specification that pins the payoff table: conservation and solvency do not pin it, two variants that conserve and stay solvent break the equilibrium, and \"formally verified\" can mean only the conjunction of checks that the code realizes the table and a proof of the equilibrium over it, with the residue no check reaches named.",
                keywords: ["smart contracts", "formal verification", "mechanized proof", "mechanism design", "specification", "verification scope"],
                industries: ["Security and audit"],
                question: "What does a machine check of a two-call bonded contract establish about the equilibrium its security rests on, and what does no check reach?",
                result: "Argued and worked: a specification of conservation and solvency admits a contract that pays the seller the buyer's whole bond and one that bonds the seller by payment alone, each conserving and solvent and each breaking the equilibrium, so the specification must pin the bond schedule and the resolution's transfers; because every comparison is per position, coupled through the accumulator, a bounded model and a per-position proof cover any chain length; the conjunction never reaches rationality, off-chain performance, equilibrium selection or a composed contract's side transfers.",
                scope: "An argument about what verification evidences for a contract of this shape, positioned against mechanized social choice and auction theory and against smart-contract verification that proves functional properties; it names no tool, run or count, and claims nothing about observed play.",
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
                summary: "Resolution is on-chain by nature and adjudication off-chain by nature. The five-layer stack, the evidentiary properties of what the chain holds, and how eIDAS, the Federal Rules of Evidence, and the UNCITRAL Model Law read it, with the limit the paper attaches to each.",
                keywords: ["electronic evidence", "smart-contract law", "dispute resolution", "blockchain evidence", "eIDAS", "UNCITRAL", "jurisdictional flexibility"],
                industries: ["Legal and dispute resolution"],
                question: "Should a smart contract adjudicate disputes, or produce what adjudication needs?",
                result: "Argued: adjudication on-chain is a category error that reintroduces the discretionary intermediary, while the data resolution leaves has evidentiary properties that eIDAS, UCC §1-201 and the UNCITRAL Model Law on Electronic Commerce can receive, each within a stated limit, so forums rule off-chain on the open process data.",
                scope: "A five-layer stack: chain security, the bonding game with the evidence it produces, coordination among the sellers, arbitration, and the legal system; the protocol says nothing of what counts as satisfactory performance; a forum rules but cannot call resolve.",
            },
            {
                title: "The Wallet as Legal Subject",
                href: "/papers/wallet-legal-subject",
                summary: "Employment law classifies workers by subordination. Under bonded commitments no party holds a power to direct another's work, so the tests find no directive relation to classify; the wallet is the on-chain position of the asset that trades through it, and where its operator holds its own key that position is property and party at once.",
                keywords: ["labor law", "employee classification", "gig economy", "private government", "subordination", "legal subject", "self-sovereign identity"],
                industries: ["Platform work", "Legal and dispute resolution"],
                question: "What do labor law's subordination tests find when productive exchange runs as bonded commitments between wallets?",
                result: "Argued: no party holds a power to direct another's conduct, so the tests find no directive relation to classify, and the limbs that test something else (the ABC test's prongs B and C, Aslam's finding on entrepreneurial opportunity) are answered on their own terms; the wallet is the position of a legal subject, the asset that trades through it, and where its operator holds its own key that position is property and party at once, collapsing the Roman partition of res and persona.",
                scope: "Where a relation stays employment-shaped in substance, or a layer of dispatch, reputation, key-holding, or the design of the terms rebuilds a platform's position, existing doctrine reaches it; the leveling reaches only those who can fund a bond and hold their own key.",
            },
            {
                title: "The Coercion Variable",
                href: "/papers/coercion-variable",
                summary: "Law has always paired texts with a coercive apparatus. The bonded commitment enforces bilateral commerce with no third party applying force: a pre-commitment, self-binding at consent, whose bonds stay locked while the buyer withholds resolution.",
                keywords: ["coercion", "sovereignty", "monopoly on violence", "pre-commitment", "bonded enforcement", "political philosophy", "Hobbes", "Weber", "Hart", "boundary of state authority"],
                industries: ["Legal and dispute resolution"],
                question: "Can bilateral commercial obligations be enforced with no third party applying force?",
                result: "Argued: the bonded commitment is a pre-commitment in Elster's sense whose bonds are offers, not threats, on Nozick's baseline test, so coercion becomes a variable of the enforcement architecture whose authority component can be set to zero in priceable, bilateral, voluntary commerce.",
                scope: "The equilibrium as proved, for any number of orders the network resolves in one call; criminal harm, externalities, public goods, status, rights, and defense stay with the sovereign; the domain of the question of legitimate coercion is narrowed, and the question itself is left to political philosophy.",
            },
            {
                title: "The Disclosure Asymmetry: Cryptoeconomic Mechanism Design and the Engineering of Consent",
                href: "/papers/the-disclosure-asymmetry",
                summary: "Consent engineering and mechanism design use the same instruments pointed opposite ways. The operation that reverses the vector is disclosure: published, deterministic rules make the participant who models the mechanism the source of trust, not its victim.",
                keywords: ["mechanism design", "engineering of consent", "manufacture of consent", "disclosure", "common knowledge", "legitimacy", "platform capitalism", "surveillance capitalism", "trust"],
                industries: ["Platforms"],
                question: "Are the engineering of consent and mechanism design one instrument, and what sets the sign of its effect?",
                result: "Argued: one variable, the participant's accuracy about the mechanism in force, sets the sign: consent engineering reaches its outcome only while accuracy is low, and a public, deterministic mechanism reaches its equilibrium as accuracy rises, in full when it is maximal; disclosure moves the variable, provided a commitment condition and an objective condition also hold.",
                scope: "Grants Viljoen, Goldenfein, and McGuigan's diagnosis of platforms and answers its extension to mechanism design; Figaro is the worked instance of all three conditions, its rules public, its arithmetic fixed at deployment, its terms chosen in designs above it.",
            },
            {
                title: "Code Is Constitution: The Entrenched Layer Beneath Enactment",
                href: "/papers/code-is-constitution",
                summary: "Not code is law but code is constitution: the entrenched procedural layer beneath enactment. Courts consume the protocol's evidence rather than operate its core, and the right regulatory demand is neutrality of procedure, while the actors at its edges comply as they always have.",
                keywords: ["constitutional political economy", "code is law", "lex cryptographia", "credible neutrality", "legality", "lex mercatoria", "decentralized protocols", "entrenchment"],
                industries: ["Regulation and licensing", "Legal and dispute resolution"],
                question: "If code is law lost its argument in the 2016 fork, which layer of rules does a decentralized protocol occupy?",
                result: "Argued: a sufficiently decentralized protocol is a constitution in the sense of constitutional political economy, an entrenched procedural layer that scores well against Fuller's eight principles of legality and is protected from capture by immutability, credible neutrality and forkability, so regulation reaches the actors at the edges through the data and leaves the arithmetic neutral.",
                scope: "Tested against one artifact, a Core of commit and resolve whose equilibrium is proved for any number of orders the network resolves in one call; congruence is claimed only for the rules the Core holds.",
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
                summary: "Between strangers the contract element that fails is consideration, and refugees, stateless people and others beyond stable banking and courts lack what ordinarily makes a promise credible. A bonded commitment makes it credible by two acts no state is asked about, a signature and a bond; the boundary is a bond they can lock.",
                keywords: ["statelessness", "refugee economies", "displaced populations", "consideration", "Arendt", "humanitarian economics", "commerce without recognition"],
                industries: ["Humanitarian"],
                question: "What does a mechanism whose precondition is a key and a bond, not recognition by a state, offer refugees, stateless people and others beyond stable banking and courts?",
                result: "Argued: between strangers the element of a contract that fails is consideration, and a bonded commitment makes it hold by two acts no state is asked about, a signature and a bond, so it supplies a credible promise where the right to have rights is denied; legality, a forum and status stay the state's, acting on persons, never on the process.",
                scope: "Rests on the equilibrium proved for any number of orders the network resolves in one call, and holds only for those who can lock a bond; eight constraints are named (keeping the key, the on-ramp, counterparty and currency gatekeeping, the absence of a forum, legality, exposure of the data, a counterparty's coercive reach, the funding of the bond), and no use of the mechanism by displaced participants has been observed.",
            },
            {
                title: "The Subordination Variable",
                href: "/papers/subordination-variable",
                summary: "The cooperative-Marxian and classical-liberal traditions agree that the wage relation divides them. Under a bonded commitment no residual right over a seller's conduct passes to anyone and no intermediary takes a recurring rent, so one artifact admits both readings and the partition relocates to the graph composed above it.",
                keywords: ["political economy", "subordination", "coordination rent", "free association", "classical liberalism", "relocation", "conditionality of the left/right partition"],
                industries: ["Platform work"],
                question: "If the cooperative-Marxian and classical-liberal traditions agree that the wage relation divides them, what is left of the partition under a mechanism with no wage relation?",
                result: "Argued: under the bonded commitment no residual right over a seller's conduct passes to anyone and no intermediary takes a rent for making the promises good, so one artifact answers both to free association and to voluntary exchange, and the partition relocates to the graph composed above the mechanism.",
                scope: "A party needs the wealth to post its bond, and the mechanism inherits its property baseline from the law around it; distribution, public goods and externalities, and the composition of participation are decided in the graph.",
            },
            {
                title: "The Visibility of Coordination",
                href: "/papers/visibility-of-coordination",
                summary: "“Strangers need a platform” has become common sense in Gramsci's sense, and beneath it an older proposition: that a promise is made good only after the fact, by an authority. Separating the coordination function from the entities that perform it makes it visible and opens the organizational space, of which the firm is one pattern. The diagnostic is turned on this arrangement too: compounding, holding, standing, disclosure.",
                keywords: ["cultural hegemony", "Gramsci", "platform economy", "political economy of infrastructure", "coordination substrate"],
                industries: ["Platforms"],
                question: "Which beliefs about how strangers coordinate rule as common sense in Gramsci's sense, and what makes them visible?",
                result: "Argued as a diagnosis: that strangers need a platform, that production needs firms, and that cross-border clearing needs rails a state or an alliance controls meet Gramsci's test; beneath them a promise is made good after the fact; and moving the guarantee before the trade shows coordination as a bundle that can be taken apart.",
                scope: "The equilibrium in the part the argument uses, proved for any number of orders the network resolves in one call; the claim is that a substitution becomes conceivable, and the same diagnostic is turned on the arrangement that proposes it.",
            },
            {
                title: "The Ungoverned Substrate",
                href: "/papers/ungoverned-substrate",
                summary: "The network-state, on-chain-governance and holacracy programs, and the Ethereum Foundation's mandate, the cypherpunks and d/acc, read in their own words, share the ex-post frame: a stranger's promise made good after the fact, so a seat must decide afterwards. A substrate that makes the promise good before the trade leaves nothing to decide after it, has no seat, and can be ungoverned; the first group's question moves up to the graph, and the second group's ask is met at the commercial layer.",
                keywords: ["network state", "blockchain governance", "holacracy", "cypherpunk", "d/acc", "Ethereum Foundation mandate", "ex ante", "ungoverned substrate", "governance at the graph"],
                industries: ["DAOs and governance"],
                question: "Must the alternative to state coordination of commerce itself be a governed entity, as the programs that propose alternatives assume?",
                result: "Argued in six parts: each program's own text places the guarantee after the fact; that frame requires a seat; a mechanism whose only acts are the parties' own signatures, commit, attestation and the buyer's resolution, with rules fixed when put on chain, decides nothing afterwards and so has no seat; for the network state, on-chain governance and holacracy the question \"who governs\" has no object at the commercial layer and relocates to the graph, where any governance or none is composed; for the mandate, the cypherpunks and d/acc the mechanism is the ex-ante instance of what they ask for.",
                scope: "The substrate alone: the execution layer beneath it is governed and that governance is inherited; criminal law, public goods and defense stay with the polity, and exit from the commercial apparatus can be partial; a comparison of frames, never of merits; the equilibrium is proved, not observed.",
            },
            {
                title: "Corridors Without a Hegemon: The Substrate as Common Infrastructure Beneath Rival Trade Corridors",
                href: "/papers/corridors-without-a-hegemon",
                summary: "Belt and Road and IMEC contest who controls the corridor. The physical layer stays with whoever finances it; the coordination layer need not: in a decentralized, permissionless one every position is a party's own, while the denomination, its issuer, and the ramps stay governed.",
                keywords: ["weaponized interdependence", "hegemony", "Belt and Road Initiative", "IMEC", "infrastructure power", "cooperation under anarchy", "permissionless substrate"],
                industries: ["Cross-border trade"],
                question: "Must a partner that chooses Belt and Road or IMEC also choose whose chokepoint its trade coordination sits behind?",
                result: "Argued: a corridor's coordination layer can rest on a decentralized, permissionless substrate whose every position belongs to a party to the trade it carries and whose data is public to every reader alike; a participant sits behind one chokepoint fewer, never none.",
                scope: "The physical layer stays with whoever finances it; the denomination, the ramps to local purchasing power and the chain beneath stay governed, and an issuer's lever over a denomination reaches through the substrate.",
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
                summary: "The process is an accounting entity: born at the first commitment, equity always zero, closed by the buyer's call. Its books are a byproduct of the trade, and an EN 16931 invoice projects from each order, its tax elements supplied by the terms.",
                keywords: ["bookkeeping", "accounting", "auditing", "double-entry", "triple-entry", "trust accounting", "audit assertions", "Pacioli", "e-invoicing", "EN 16931"],
                industries: ["Accounting and audit", "E-invoicing and tax"],
                question: "What is a bonded process in the accounting register, and what does it leave of the accounting professions?",
                result: "Shown entry by entry: the process is an accounting entity born at the first commitment, with equity identically zero and no revenue or expense account, and the buyer's resolution is a closing entry that zeroes every account the period opened; journal-keeping and the close become byproduct, while interpretive judgment and the audit against the world continue.",
                scope: "The accounts of one bonded process, never performance, the parties' own accounts or their reporting frameworks; the ledger inherits the reliability of the chain and its signature scheme; control of a position is control of the wallet's keys.",
            },
            {
                title: "Substrate-Broadening Retroactive Public-Goods Funding",
                href: "/papers/substrate-broadening-rpgf",
                summary: "How 600 million florins reward clause and assembly designers after the fact: nine annual periods with rising budgets, usage counted on chain as it happens, breadth over volume, and Sybil resistance from a two-sided live stake.",
                keywords: ["retroactive public goods funding", "mechanism design", "resource allocation", "verified usage accounting", "permissionless recording", "deterministic allocation", "clause authoring", "assembly design", "coordination protocols"],
                industries: ["Tokens and treasuries", "Builders"],
                question: "How are 600 million florins distributed to the designers of clauses, registered agreements and assemblies, with no committee and no list to curate?",
                result: "Specified and proved: a registration's share of a period is its score c^(1/3)·d^(2/3) over the period's total; any weighting layer is either a function of the same counters or a judgment supplied from outside them; and capturing a fraction of a period's budget costs an outlay convex in that fraction and unbounded as it approaches one.",
                scope: "Use is counted on chain at resolution from facts the chain already holds; Sybil resistance comes from a live stake in the base chain's currency on both sides of a counted event; it rewards clause, agreement and assembly design and nothing else; it holds no social-welfare objective.",
            },
        ],
    },
    {
        slug: "ai-optimization-control",
        disciplineIndex: 7,
        name: "AI, Optimization and Control Theory",
        discipline: "Agent coordination · allocation · control of the mesh",
        intro: "Steering and stability: encoding a coordination objective as a cost function and designing for dynamic stability around it, with the multiscale dynamics that link individual decisions to system-level outcomes.",
        definition: "Agent-mediated coordination over bonded commitments: a substrate that reads signatures and bonds, never the kind of entity behind a key, is the enforcement layer mutually untrusted multi-agent systems lacked. The papers here ask what control theorists and multi-agent-systems people ask of it.",
        papers: [
            {
                title: "What a Trust Layer for Agents Acting for Principals Needs",
                href: "/papers/actor-neutral-coordination",
                summary: "An agent acting for a principal needs, from a stranger it has never met, a promise that is good before the work and a ceiling on what one commitment can cost the principal. A reputation registry, a validator's stake over finished work and a legal wrapper each supply neither; a bond locked at commit supplies both, and leaves the aggregate bound to the agent's own policy.",
                keywords: ["multi-agent coordination", "bonded commitment", "autonomous agents", "principal-agent", "reputation", "legal wrapper", "AI agent design"],
                industries: ["AI agents"],
                question: "What must a trust layer supply to an agent that commits on a principal's behalf, and can a reputation registry or a legal wrapper supply it?",
                result: "Argued in six parts: enforcement before the work and a ceiling on loss are what the principal needs; a reputation registry is unbonded statements about the past, a validator's stake secures a report on work already done, and a legal wrapper is standing and liability enforced after the fact, so none supplies either; the bond makes the stranger's performance its best reply before the work, and the tokens the mechanism can move out of the agent's wallet on one commitment are at most the bond the agent locked; the bound over many commitments is the agent's policy's.",
                scope: "The mechanism reads nothing of who or what holds a key, so the result holds for software and people alike; the cost of performing and any value handed over off-chain lie outside the bound; a principal's recourse against its own agent is the law's; a wrapper and a bond compose, and a principal may want both.",
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
                summary: "How the equilibrium argument fares with loss-averse, boundedly rational, stranger-wary people: the payoffs straddle the reference point, so loss aversion weights defection alone, and the coordination-failure condition is conceded: pessimism buys duration, not a worse outcome.",
                keywords: ["behavioral game theory", "loss aversion", "prospect theory", "weakest-link coordination", "peer pressure", "incentive legibility", "mechanism design", "experimental economics", "interface cognition"],
                industries: [],
                question: "How does the equilibrium fare with participants who are loss-averse, boundedly reasoning, and pessimistic about strangers?",
                result: "Four hypotheses, derived and unobserved: loss aversion weights the defecting branch; the Van Huyck coordination-failure condition is present, but pessimism buys duration rather than a worse outcome; atomic resolution gives each seller a bonded interest in every other seller's performance; and each node asks one comparison and one step of reasoning.",
                scope: "Takes the equilibrium as proved, for any number of orders the network resolves in one call, and the experimental literature's estimates, the meta-analytic interval for loss aversion and the reasoning depth of the level-k literature, as given.",
            },
            {
                title: "External Events and the Resolution Frame: One Rule for Everything the World Does Between the Two Calls",
                href: "/papers/external-events",
                summary: "Between commit and resolve the world goes on. Any occurrence that changes what the parties want the resolution to be is squared before the terminal call, with fewer transfers than there are parties, and the buyer's comparison is unchanged.",
                keywords: ["external events", "resolution frame", "discretionary and deterministic decision", "incomplete contracts", "unforeseen contingencies", "renegotiation", "private ordering", "netting completeness", "bonded commitment", "decision science"],
                industries: [],
                question: "What happens when the world changes the resolution the parties want, between commit and resolve?",
                result: "Proved: transfers among the parties before resolution reach every zero-sum reallocation of the committed schedule with fewer transfers than there are parties; none touches a bond, so after performance resolving stays strictly better for the buyer; and, given that the agreed reallocation closes the process, a seller executes an agreed transfer below P_i + 2G_i − r_i, a threshold whose floor P_i + G_i is computable from the accumulator alone.",
                scope: "One denomination per process; transfers among the parties only, from balances they hold; the frame executes the reallocation the parties agree and chooses none; the result is one-sided, securing what a failing seller transfers and leaving the buyer's part to its commercial reason.",
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
