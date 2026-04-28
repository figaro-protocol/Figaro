import Link from "next/link";

interface PaperCard {
    id: string;
    discipline: string;
    title: string;
    audience: string;
    summary: string;
    pageHref?: string;
    pdfHref: string;
}

const PAPERS: Record<string, PaperCard> = {
    A: {
        id: "A",
        discipline: "Mechanism design",
        title: "Asymmetric Bonding: A Self-Enforcing Settlement Primitive for N-Party Coordination",
        audience: "Game theorists, mechanism designers",
        summary:
            "The core mechanism. Two-party Nash result, escape-hatch impossibility, N-party generalization with progressive collateralization, weakest-link reduction over joint-liability microfinance.",
        pdfHref: "/papers/figaro-mechanism.pdf",
    },
    B1: {
        id: "B1",
        discipline: "Institutional economics",
        title: "From Firms to Transaction-Scoped Institutions: A Coasean Re-Examination Under Costless Bilateral Enforcement",
        audience: "Institutional economists, TCE & property-rights theorists",
        summary:
            "What happens to the boundary of the firm when contract enforcement collapses to a fixed capital lockup. Coasean threshold shift, the coordination firm vs. the capital firm, engagement with Williamson and Hart.",
        pageHref: "/economics",
        pdfHref: "/papers/figaro-economics.pdf",
    },
    B2: {
        id: "B2",
        discipline: "Political economy",
        title: "The Visibility of Coordination: A Gramscian Reading of the Platform Economy and Its Successor",
        audience: "Political economy, journalism, infrastructure-critique communities",
        summary:
            "Why the proposition that two strangers need a platform feels like common sense — and why making the coordination function visible is the prerequisite work. Diagnostic, not predictive.",
        pageHref: "/sovereign-commerce",
        pdfHref: "/papers/figaro-sovereign-commerce.pdf",
    },
    C: {
        id: "C",
        discipline: "Implementation & verification",
        title: "The Figaro Kernel: A Verified Solidity Implementation of Asymmetric Bonding",
        audience: "Smart-contract engineers, formal-methods practitioners",
        summary:
            "Solidity kernel with two functions and three mappings. Four-layer verification: TLA⁺ (7 invariants / 6M+ states), Echidna (7 properties), Halmos (7 z3-backed proofs), Certora (25 kernel-relevant rules across three specs).",
        pageHref: "/verification",
        pdfHref: "/papers/figaro-verification.pdf",
    },
    D: {
        id: "D",
        discipline: "Cryptoeconomics",
        title: "FIG: A Coordination Token Decoupled from Protocol Activity",
        audience: "Cryptoeconomics researchers, token designers",
        summary:
            "Why the FIG token does not accrue from kernel activity. Fixed 1B cap with two-tier supply enforcement, one-way deployer renouncement, single staged-merkle airdrop with three immutable calendar unlocks. Why an earlier Euler-oscillation design was rejected.",
        pageHref: "/fig/design",
        pdfHref: "/papers/figaro-fig-token.pdf",
    },
    E: {
        id: "E",
        discipline: "Law & evidence",
        title: "On-Chain Evidence, Off-Chain Adjudication: A Layered Approach to Smart-Contract Dispute Resolution",
        audience: "Legal scholars, COALA, compliance practitioners",
        summary:
            "Settlement on chain, adjudication off chain. The evidentiary properties of EIP-712 commitments, fit with eIDAS / UCC / UNCITRAL / Singapore ETA, and the structural objection to on-chain juries.",
        pageHref: "/legal",
        pdfHref: "/papers/figaro-legal.pdf",
    },
    F1: {
        id: "F1",
        discipline: "Labor law & legal philosophy",
        title: "The Wallet as Legal Subject: Subordination, Property, and the Dissolution of the Employee–Contractor Line",
        audience: "Labor-law scholars, legal philosophers, gig-economy researchers",
        summary:
            "Labor law classifies workers along the subordination axis; every doctrinal test (ABC, IRS, UK Aslam, EU Platform Work Directive) places a threshold on that axis. The bonded primitive removes the axis by removing the employment relation. The wallet collapses the Roman res/persona distinction — every productive asset is simultaneously property and party. Drawing on Anderson, Ellerman, and Taleb.",
        pageHref: "/labor-law",
        pdfHref: "/papers/figaro-labor-law.pdf",
    },
    F2: {
        id: "F2",
        discipline: "Humanitarian economics & legal philosophy",
        title: "The Wallet Without a Polity: Displaced and Stateless Subjects under a Bonded Settlement Primitive",
        audience: "Refugee-economics scholars, humanitarian-policy researchers, legal philosophers of personhood",
        summary:
            "The wallet-as-legal-subject argument extends to populations whose access to civil-legal subjecthood is itself disrupted: refugees, stateless persons, undocumented migrants. The primitive does not resolve statelessness; it provides a commerce architecture whose precondition is a cryptographic key rather than a recognized civil-legal subjecthood. Arendt's right to have rights vs. the capacity to have commerce: the technology cannot grant the first; it can structurally enable the second.",
        pageHref: "/displaced",
        pdfHref: "/papers/figaro-polity.pdf",
    },
    G: {
        id: "G",
        discipline: "Accounting & auditing",
        title: "Bookkeeping as Protocol Byproduct: Self-Closing Ledger Periods in the Figaro Settlement Primitive",
        audience: "Accounting researchers, auditing scholars, commercial-law academics",
        summary:
            "A Figaro process is a self-closing ledger period: the custodial balance of the contract is the balance-sheet position; commit and resolve events are journal and closing entries; the process dissolves when resolution discharges all custodial liabilities. The Pacioli apparatus (bookkeeping, audit, commercial law built on authoritative books) becomes optional for activity settled through the protocol. What remains is interpretive, translational, and audit-against-reality work.",
        pageHref: "/accounting",
        pdfHref: "/papers/figaro-accounting.pdf",
    },
};

interface ReadingPath {
    identity: string;
    discipline: string;
    order: string[];
    pitch: string;
}

const READING_PATHS: ReadingPath[] = [
    {
        identity: "I'm a lawyer",
        discipline: "Law / legal philosophy",
        order: ["E", "F1", "F2", "B1", "G"],
        pitch: "E is the evidentiary framework — read it first. F1 extends it into labor law and personhood; F2 extends it again into statelessness and humanitarian economics. B1 is the institutional-economics context; G if the matter touches accounting records or audit.",
    },
    {
        identity: "I'm an economist",
        discipline: "Economics",
        order: ["B1", "A", "D", "G"],
        pitch: "B1 is written for you. A gives you the enforcement mechanism that B1 assumes. D is the token-design piece — only if monetary questions matter to your work. G if you care about the accounting-side implications.",
    },
    {
        identity: "I'm a smart-contract engineer",
        discipline: "Software / cryptography",
        order: ["A", "C", "D"],
        pitch: "A for the mechanism you're implementing, C for the Solidity and verification layer, D if the token contracts are in scope. Read C with the repo open.",
    },
    {
        identity: "I'm a mechanism designer",
        discipline: "Game theory",
        order: ["A", "D", "F1"],
        pitch: "A is the whole paper for you. D extends the mechanism argument into token design. F1 applies the same frame to labor classification, if institutional questions interest you.",
    },
    {
        identity: "I'm a political economist",
        discipline: "Political economy / infrastructure critique",
        order: ["B2", "A", "B1", "F1"],
        pitch: "B2 is the diagnosis and the framing you'll find most familiar. A gives you the substrate; B1 the institutional implications; F1 if you care about labor/personhood specifically.",
    },
    {
        identity: "I'm an accountant or auditor",
        discipline: "Accounting / audit",
        order: ["G", "E", "B1"],
        pitch: "G reframes bookkeeping, audit, and period close. E for evidentiary admissibility. B1 for the broader institutional shift that reshapes what your profession is doing.",
    },
    {
        identity: "I'm a labor-law scholar",
        discipline: "Labor law / gig economy",
        order: ["F1", "E", "B1"],
        pitch: "F1 is written for you. E for the evidence/adjudication frame it assumes. B1 for the institutional-economics ground the labor question sits on.",
    },
    {
        identity: "I'm a refugee-economics or humanitarian-policy scholar",
        discipline: "Humanitarian economics / statelessness",
        order: ["F2", "F1", "E", "B1"],
        pitch: "F2 is written for you — the wallet-without-a-polity argument and the Arendt distinction. F1 for the labor-law version of the same wallet-collapse mechanism. E for the evidentiary infrastructure that survives the absence of a stable forum. B1 for the broader institutional shift.",
    },
    {
        identity: "I'm a cryptoeconomics researcher",
        discipline: "Cryptoeconomics / token design",
        order: ["D", "A", "B1"],
        pitch: "D for the token itself (and why it deliberately refuses the usual fee-accrual design). A for the kernel it sits above. B1 for the economic regime it presumes.",
    },
    {
        identity: "I'm a network-state or on-chain-coordination thinker",
        discipline: "Crypto-native coordination",
        order: ["B2", "A", "B1", "G"],
        pitch: "B2 names the hegemonic configuration your program is trying to exit and positions Figaro relative to Hirschman, Srinivasan, and the chamber-without-arbiter family. A for the primitive your stack needs. B1 for the institutional-economics follow-through. G for the bookkeeping primitive the regen / public-goods crowd has been searching for.",
    },
    {
        identity: "I want the shortest path",
        discipline: "Single-paper read",
        order: ["A"],
        pitch: "Read Paper A. It's the substrate every other paper assumes. If only one paper is for you, it's this one.",
    },
];

function PaperChip({ id }: { id: string }) {
    const p = PAPERS[id];
    return (
        <a
            href={`#paper-${id}`}
            className="inline-flex items-baseline gap-1.5 border border-gray-200 rounded px-2 py-0.5 text-xs font-mono hover:border-black hover:bg-gray-50 transition-colors"
            title={p.title}
        >
            <span className="font-semibold text-black">{id}</span>
            <span className="text-gray-500">{p.discipline}</span>
        </a>
    );
}

export default function Research() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Research
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Pick a reading path.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Nine papers, one audience each. Crypto is multi-disciplinary; readers are not. Tell us who you are and read the papers in the order that makes sense for your field.
                </p>
            </section>

            {/* Reading paths */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Reading paths
                </p>
                <h2 className="text-3xl font-bold text-black mb-8 leading-tight">
                    By discipline.
                </h2>
                <div className="space-y-5">
                    {READING_PATHS.map((path) => (
                        <div
                            key={path.identity}
                            className="border border-gray-200 rounded-lg p-5"
                        >
                            <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
                                <h3 className="text-base font-bold text-black">
                                    {path.identity}
                                </h3>
                                <div className="text-xs text-gray-400 uppercase tracking-widest shrink-0">
                                    {path.discipline}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                {path.order.map((id, idx) => (
                                    <span key={id} className="flex items-center gap-2">
                                        <PaperChip id={id} />
                                        {idx < path.order.length - 1 && (
                                            <span className="text-gray-300 text-xs">&rarr;</span>
                                        )}
                                    </span>
                                ))}
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed">
                                {path.pitch}
                            </p>
                        </div>
                    ))}
                </div>
                <p className="mt-8 text-sm text-gray-500 leading-relaxed">
                    The papers are independent. No path is prescriptive &mdash; skip any paper that isn&apos;t in your field. The chips link to full cards below.
                </p>
            </section>

            {/* All papers */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    All papers
                </p>
                <h2 className="text-3xl font-bold text-black mb-8 leading-tight">
                    Nine papers. One audience each.
                </h2>
                <div className="space-y-4">
                    {Object.values(PAPERS).map((p) => (
                        <article
                            key={p.id}
                            id={`paper-${p.id}`}
                            className="border border-gray-200 rounded-lg p-6 scroll-mt-24 hover:border-black transition-colors"
                        >
                            <div className="flex items-baseline justify-between gap-4 mb-3">
                                <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                                    Paper {p.id} &middot; {p.discipline}
                                </div>
                                <div className="text-xs text-gray-400 shrink-0">
                                    {p.audience}
                                </div>
                            </div>
                            <h3 className="text-lg font-bold text-black mb-2 leading-snug">
                                {p.title}
                            </h3>
                            <p className="text-sm text-gray-700 leading-relaxed mb-4">
                                {p.summary}
                            </p>
                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                                <a
                                    href={p.pdfHref}
                                    className="font-semibold text-black hover:text-gray-600 transition-colors"
                                >
                                    Download PDF &rarr;
                                </a>
                                {p.pageHref && (
                                    <Link
                                        href={p.pageHref}
                                        className="font-semibold text-black hover:text-gray-600 transition-colors"
                                    >
                                        Discipline page &rarr;
                                    </Link>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            {/* Versioning note */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    On versioning
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Each paper is preprint-grade. Snapshot date for the implementation paper (C): 2026-04-23. Mechanism, economics, and political-economy papers age slowly; verification numbers in C are re-issued per release.
                </p>
            </section>

        </>
    );
}
