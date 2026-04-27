import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Publications — Figaro Protocol",
    description: "Nine research papers. One discipline each.",
};

const PAPER_PDF_BASE = "https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/paper";

type Paper = {
    id: string;
    title: string;
    discipline: string;
    summary: string;
    pdf: string;
    companion?: string;
};

const papers: Paper[] = [
    {
        id: "A",
        title: "Mechanism",
        discipline: "Mechanism design · game theory",
        summary: "The game-theoretic derivation. The asymmetric-bonding argument, the 2× minimum ratio, buyer dominance, progressive collateralization, and the six protocol properties. The substrate every other paper assumes.",
        pdf: `${PAPER_PDF_BASE}/figaro3a.pdf`,
        companion: "/mechanism",
    },
    {
        id: "B1",
        title: "Institutional economics",
        discipline: "Coasean / post-firm",
        summary: "Coase, Williamson, and the firm as a transaction-cost response. What dissolves when coordination cost collapses to protocol level. Transaction-scoped institutions as the unit of commerce.",
        pdf: `${PAPER_PDF_BASE}/figaro3b1.pdf`,
        companion: "/economics",
    },
    {
        id: "B2",
        title: "Political economy",
        discipline: "Hegemony / sovereignty",
        summary: "Gramscian hegemony, platform capital, and sovereign coordination. The protocol is ideologically agnostic; the graph is the politics.",
        pdf: `${PAPER_PDF_BASE}/figaro3b2.pdf`,
        companion: "/sovereign-commerce",
    },
    {
        id: "C",
        title: "Implementation",
        discipline: "Systems",
        summary: "Contracts, ABIs, validator architecture, merkle-bound attestation receipts, batch execution. What got built and why.",
        pdf: `${PAPER_PDF_BASE}/figaro3c.pdf`,
    },
    {
        id: "D",
        title: "Token design",
        discipline: "Cryptoeconomics",
        summary: "FIG as a coordination Schelling point rather than a governance or yield token. Settlement-anchored minting, halving, cap. Why FIG is not required to participate.",
        pdf: `${PAPER_PDF_BASE}/figaro3d.pdf`,
        companion: "/fig/design",
    },
    {
        id: "E",
        title: "Evidence and law",
        discipline: "Evidence law",
        summary: "eIDAS, UCC, UNCITRAL admissibility. Why off-chain adjudication, not on-chain juries. The chain as timestamped evidence layer for the residual 1%.",
        pdf: `${PAPER_PDF_BASE}/figaro3e.pdf`,
        companion: "/legal",
    },
    {
        id: "F1",
        title: "Labor law",
        discipline: "Subordination / wallet-as-subject",
        summary: "The wage-employment relationship disappears when contributors bond directly against the process. Employment law meets peer-to-peer value creation.",
        pdf: `${PAPER_PDF_BASE}/figaro3f1.pdf`,
        companion: "/labor-law",
    },
    {
        id: "F2",
        title: "Displaced and stateless",
        discipline: "Humanitarian economics",
        summary: "A commerce primitive whose precondition is a cryptographic key, not a passport. Refugees, stateless persons, undocumented migrants, populations without stable banking.",
        pdf: `${PAPER_PDF_BASE}/figaro3f2.pdf`,
        companion: "/displaced",
    },
    {
        id: "G",
        title: "Accounting",
        discipline: "Pacioli · self-closing period",
        summary: "Double-entry bookkeeping rewritten for a world where every trade closes its own ledger period. The self-closing institution as an accounting unit.",
        pdf: `${PAPER_PDF_BASE}/figaro3g.pdf`,
        companion: "/accounting",
    },
];

export default function Publications() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Publications
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    Nine papers. One discipline each.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Each paper is addressed to a specific discipline. They share one kernel but make the argument in the vocabulary of their readers. Start with yours.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <ul className="space-y-6">
                    {papers.map((p) => (
                        <li key={p.id} id={`paper-${p.id.toLowerCase()}`} className="border-b border-gray-100 pb-6">
                            <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                                <span className="font-mono text-sm text-gray-500">Paper&nbsp;{p.id}</span>
                                <span className="text-xs text-gray-500">·</span>
                                <span className="text-xs text-gray-500">{p.discipline}</span>
                            </div>
                            <h3 className="text-xl font-bold text-black mb-2">{p.title}</h3>
                            <p className="text-sm text-gray-700 leading-relaxed mb-3">{p.summary}</p>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                                <a href={p.pdf} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-black hover:underline">
                                    Read PDF &rarr;
                                </a>
                                {p.companion && (
                                    <Link href={p.companion} className="text-gray-700 hover:text-black hover:underline">
                                        Web companion &rarr;
                                    </Link>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            </section>
        </>
    );
}
