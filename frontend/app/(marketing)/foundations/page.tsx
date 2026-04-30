import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Foundations — Figaro Protocol",
    description:
        "Voshmgir & Zargham, Foundations of Cryptoeconomic Systems (2024). Eight disciplines converge on the substrate; Figaro's papers are organized along that taxonomy.",
};

interface PaperLink {
    id: string;
    title: string;
    href: string;
}

interface DisciplineBlock {
    name: string;
    subdiscipline: string;
    description: string;
    papers: PaperLink[];
}

const DISCIPLINES: DisciplineBlock[] = [
    {
        name: "Economics and Game Theory",
        subdiscipline: "Mechanism design · institutional economics · monetary theory",
        description:
            "Equilibrium analysis of asymmetric bonding, the firm boundary under costless bilateral enforcement, and the design of a coordination token decoupled from protocol activity.",
        papers: [
            { id: "A", title: "Asymmetric Bonding: A Self-Enforcing Settlement Primitive", href: "/papers/figaro-mechanism.pdf" },
            { id: "B1", title: "From Firms to Transaction-Scoped Institutions", href: "/papers/figaro-economics.pdf" },
            { id: "D", title: "FIG: A Coordination Token Decoupled from Protocol Activity", href: "/papers/figaro-fig-token.pdf" },
        ],
    },
    {
        name: "Industrial and Systems Engineering",
        subdiscipline: "Process modeling · supply-chain coordination",
        description:
            "How bonded commitments compose into multi-party process trees with auditable handoffs, lifecycle attestation, and proximity proof. Open call for contributed articles.",
        papers: [],
    },
    {
        name: "Computer Science and Cryptography",
        subdiscipline: "Protocol implementation · formal verification",
        description:
            "The verified Solidity kernel that carries the equilibrium argument from paper into deployable code, exercised by four formal-method stacks.",
        papers: [
            { id: "C", title: "The Figaro Kernel: A Verified Solidity Implementation", href: "/papers/figaro-verification.pdf" },
        ],
    },
    {
        name: "Philosophy, Law and Ethics",
        subdiscipline: "Contract theory · evidence law · labor law · stateless subjecthood",
        description:
            "How a bonded primitive interacts with off-chain adjudication, with the employee–contractor line, with statelessness, and with the sovereign's monopoly on force.",
        papers: [
            { id: "E", title: "On-Chain Evidence, Off-Chain Adjudication", href: "/papers/figaro-legal.pdf" },
            { id: "F1", title: "The Wallet as Legal Subject", href: "/papers/figaro-labor-law.pdf" },
            { id: "F2", title: "The Wallet Without a Polity", href: "/papers/figaro-polity.pdf" },
            { id: "H", title: "The Coercion Variable", href: "/papers/figaro-political-philosophy.pdf" },
        ],
    },
    {
        name: "Political Science and Governance",
        subdiscipline: "Political economy · hegemony · sovereign coordination",
        description:
            "The substrate's neutrality on the left/right partition, what the platform economy makes invisible, and what governance programs at the substrate layer presuppose away.",
        papers: [
            { id: "B2", title: "The Visibility of Coordination", href: "/papers/figaro-sovereign-commerce.pdf" },
            { id: "B3", title: "The Subordination Variable", href: "/papers/figaro-political-economy.pdf" },
            { id: "I", title: "The Ungoverned Substrate", href: "/papers/figaro-network-state.pdf" },
        ],
    },
    {
        name: "Operations Research and Management Science",
        subdiscipline: "Resource allocation · accounting · ledger design",
        description:
            "Bookkeeping as a byproduct of settlement: a Figaro process is a self-closing ledger period; the Pacioli apparatus becomes optional for activity settled through the protocol.",
        papers: [
            { id: "G", title: "Bookkeeping as Protocol Byproduct", href: "/papers/figaro-accounting.pdf" },
        ],
    },
    {
        name: "AI, Optimization and Control Theory",
        subdiscipline: "Agent coordination · allocation · control of the mesh",
        description:
            "Agent-mediated coordination over bonded commitments. An Agent SDK exists at the runtime tier (see /integrate); academic articles in this discipline are an open call.",
        papers: [],
    },
    {
        name: "Psychology and Decisions Science",
        subdiscipline: "Behavioral game theory · incentive legibility · interface cognition",
        description:
            "How participants read a bonded equilibrium under uncertainty; the legibility of incentive structure to non-specialist readers. Open call for contributed articles.",
        papers: [],
    },
];

export default function Foundations() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Foundations
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Cryptoeconomic systems are multi-disciplinary.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Voshmgir &amp; Zargham frame the field as eight disciplines
                    converging on the same substrate &mdash; each asks the substrate
                    a different question in its own vocabulary. Figaro&apos;s papers
                    are organized along that taxonomy. Empty disciplines are open
                    calls: the substrate touches them; the papers do not yet exist.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <figure className="mx-auto max-w-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/images/foundations-zargham-2024.jpg"
                        alt="Voshmgir & Zargham, Foundations of Cryptoeconomic Systems, figure 1: the eight disciplines converging on cryptoeconomic systems."
                        width={1014}
                        height={612}
                        className="w-full h-auto rounded-lg border border-gray-200"
                    />
                    <figcaption className="text-xs text-gray-500 italic mt-2">
                        Figure from Voshmgir &amp; Zargham,{" "}
                        <em>Foundations of Cryptoeconomic Systems</em> (2024).
                        Reproduced with attribution.
                    </figcaption>
                </figure>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
                    {DISCIPLINES.map((d, i) => (
                        <article
                            key={d.name}
                            id={`discipline-${i + 1}`}
                            className="border-b border-gray-100 pb-6"
                        >
                            <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2">
                                {String(i + 1).padStart(2, "0")} &mdash; {d.name}
                            </p>
                            <h3 className="text-xl font-bold text-black mb-1 leading-snug">
                                {d.subdiscipline}
                            </h3>
                            <p className="text-sm text-gray-700 leading-relaxed mb-3">
                                {d.description}
                            </p>
                            {d.papers.length > 0 ? (
                                <ul className="space-y-1 text-sm">
                                    {d.papers.map((p) => (
                                        <li key={p.id}>
                                            <a
                                                href={p.href}
                                                className="text-gray-700 hover:text-black hover:underline"
                                            >
                                                <span className="font-mono text-xs text-gray-500">
                                                    {p.id}
                                                </span>{" "}
                                                &mdash; {p.title}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-500 italic">
                                    No published papers yet. Contribute via{" "}
                                    <Link href="/groups" className="underline">
                                        /groups
                                    </Link>
                                    .
                                </p>
                            )}
                        </article>
                    ))}
                </div>
            </section>

            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-base text-gray-700 leading-relaxed">
                    Working in one of these disciplines, or want to be? Read,
                    propose, contribute via{" "}
                    <Link href="/groups" className="underline font-semibold">
                        /groups
                    </Link>
                    .
                </p>
            </section>
        </>
    );
}
