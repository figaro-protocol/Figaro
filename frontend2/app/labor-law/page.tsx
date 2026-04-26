import Link from "next/link";

export default function LaborLaw() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Labor law &amp; legal philosophy
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    The employee&ndash;contractor line has no principled location.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Every jurisdiction&apos;s labor-classification test places a threshold somewhere on the subordination continuum. The threshold is the perpetual subject of legislative and judicial contest &mdash; AB5, Prop 22, <em>Uber BV v Aslam</em>, the EU Platform Work Directive. Same case, relitigated. Figaro removes the axis by removing the employment relation.
                </p>
            </section>

            {/* Subordination as the variable */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The variable
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Subordination is a continuum. The threshold is a choice.
                </h2>
                <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>
                        Labor law distinguishes employees from independent contractors along a single doctrinal axis: the degree of subordination the employer exercises over how the worker conducts themselves within the employer&apos;s system of processes and values. The IRS twenty-factor test, California&apos;s ABC test, UK <em>Autoclenz</em>/<em>Aslam</em>, Continental <em>subordination juridique</em> &mdash; these all operationalize the same variable.
                    </p>
                    <p>
                        The axis is a continuum. Any specific test places a threshold somewhere on it, and whichever side a given arrangement falls on becomes the object of rent-seeking effort by the party for whom that side is cheaper. Employers push upward (contractors are cheaper); workers with bargaining power push downward (employees get benefits). The threshold has no principled location; the fight is perpetual.
                    </p>
                </div>
            </section>

            {/* Philosophical position */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The philosophical position
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Three readings of the employment relation.
                </h2>
                <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Ellerman &mdash; the firm as rent-a-person</div>
                        <p>Ellerman (1992) argues the employment contract is ontologically incoherent: it attempts to rent <em>persona</em> on the same terms as <em>res</em>. Ordinary jurisprudence holds that persons cannot be rented &mdash; a doctrine that predates and survived the legal abolition of chattel slavery. The employment contract honors the formal doctrine (contract for labor power, not for the person) while the substance exercises the same operative control.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Anderson &mdash; the firm as private government</div>
                        <p>Anderson (2017) makes the complementary argument at the level of political theory. Firms exercise governmental powers over employees &mdash; mandatory schedules, speech restrictions, body surveillance, arbitrary dismissal &mdash; that are constitutionally proscribed when exercised by the state. The firm is a private government; the employment relation is the governance relation within it.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Taleb &mdash; &ldquo;an employee is practically a slave&rdquo;</div>
                        <p>Taleb (2018), in a chapter titled &ldquo;How to Legally Own Another Person&rdquo;, compresses the same observation: the employment relation differs from chattel slavery in intensity, duration, and reversibility &mdash; not in structural kind. All three arrangements (slavery, serfdom/apprenticeship, employment) place one party&apos;s conduct under another party&apos;s authority; the differences are quantitative along the subordination axis.</p>
                    </div>
                </div>
                <p className="mt-6 text-xs text-gray-500 leading-relaxed">
                    The paper does not endorse any of these positions. They are descriptive readings of what the subordination continuum is a continuum of. Modern labor law&apos;s protections are substantial and distinguish the employee from the serf and the serf from the slave; the axis itself is structural, not moral.
                </p>
            </section>

            {/* The wallet as legal subject */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The wallet move
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    <em>Res</em> and <em>persona</em>, collapsed.
                </h2>
                <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>
                        Roman private law distinguishes <em>res</em> (property, objects that can be owned) from <em>persona</em> (parties capable of acting legally). Modern private law inherited the distinction: physical assets are <em>res</em>; natural persons and recognized legal persons are <em>personae</em>; the two interact through contracts of sale, lease, license, and &mdash; here is the tension &mdash; labor.
                    </p>
                    <p>
                        The employment contract treats the worker&apos;s labor power as <em>res</em> rented from the worker for a specified period under the employer&apos;s direction. This is operationally coherent only because the legal tradition has learned to overlook the <em>persona</em>/<em>res</em> boundary in this one setting. Every labor-classification test is implicitly policing that boundary without naming it.
                    </p>
                    <p>
                        A Figaro wallet does not fit either category. It is a property (a cryptographic key-pair owned by its holder) <em>and</em> a party (it signs commitments, posts bonds, receives settlement, accrues credentials). The productive asset is simultaneously <em>res</em> and <em>persona</em> &mdash; self-owned rather than owned or rented.
                    </p>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-3">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-16 shrink-0 uppercase">Self</span>
                        <span>A wallet cannot be owned by another wallet. Ownership transfer requires key transfer, which is change of control, not change of subject.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-16 shrink-0 uppercase">Direct</span>
                        <span>Each bonded commitment is signed by the parties themselves. No rental of persona; no construct in which one wallet&apos;s persona is rented to another for a defined period.</span>
                    </li>
                    <li className="flex gap-3">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-16 shrink-0 uppercase">Carry</span>
                        <span>Skills, certifications, performance history, and operator profiles attach to the wallet as NFT-anchored credentials. The resume becomes the wallet; the reference becomes an attestation.</span>
                    </li>
                </ul>
            </section>

            {/* Gig-economy cases */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The gig-economy cases, re-read
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Four measures, one vanishing subject.
                </h2>
                <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">AB5 (California, 2019)</div>
                        <p>Codified the ABC test from <em>Dynamex</em>, shifting default to employee status. Under the primitive, none of the three prongs are well-posed: no hiring entity to direct and control (A), no usual-course-of-business container (B), independently established by default (C).</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Proposition 22 (California, 2020)</div>
                        <p>Created a statutory exception to AB5 for app-based rideshare/delivery drivers. Under the primitive, the carve-out is unnecessary because the category being carved out of does not apply.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Uber BV v Aslam (UK Supreme Court, 2021)</div>
                        <p>Held unanimously that Uber drivers are &ldquo;workers&rdquo; &mdash; an intermediate UK category attracting minimum-wage and holiday-pay protections. The Court examined subordination-in-substance rather than the contractual label. Under the primitive, there is no substance-behind-label to examine; each bonded counterparty signs commitment-by-commitment from its own wallet.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">EU Platform Work Directive (2024)</div>
                        <p>Establishes a presumption of employment for platform workers when specified control criteria are met. Under the primitive, no platform exists between parties whose algorithmic management would trigger the presumption.</p>
                    </div>
                </div>
                <p className="mt-6 text-sm text-gray-500 leading-relaxed">
                    The cases do not fail in the Figaro setting. They have no application there.
                </p>
            </section>

            {/* Leveller / privatizer */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The trade-off
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Leveller and privatizer.
                </h2>
                <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <p>
                        Figaro eliminates a structural asymmetry: the subordination gradient between employer and employee. Every party is bonded on identical terms; every party signs from their own wallet; no party is rented as <em>persona</em>. That is the leveller effect.
                    </p>
                    <p>
                        The protections labor law built around the employment relation &mdash; employer-funded healthcare, payroll taxes feeding unemployment insurance, employer pension contributions, workplace-safety inspections tied to employer status, collective bargaining structured around bargaining units within firms &mdash; are all attached to the category the primitive removes. When employment is not the container, employment-attached protections are not delivered. That is the privatizer effect.
                    </p>
                    <p>
                        Three possible political responses: attach protections to the wallet (portable benefits purchased per unit of bonded activity); attach protections to citizenship (UBI, single-payer healthcare, state-funded unemployment); preserve the employment option alongside (the primitive does not abolish employment; it coexists with it). Each has different distributive consequences. The fight over which one dominates will occupy the political economy of the next several decades.
                    </p>
                    <p className="text-gray-500">
                        The primitive does not answer the policy question. It makes the question explicit: the attachment of protections to employment was a historical contingency that looked like a natural fact; once the category is removable, the attachment becomes a policy choice.
                    </p>
                </div>
            </section>

            {/* Read more */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                    <div className="max-w-xl">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                            Read the paper
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The full labor-law argument, including doctrinal treatment of the ABC test, UK worker category, and the EU Platform Work Directive, with engagement with Anderson, Ellerman, and Taleb, is in the labor-law paper.
                        </p>
                        <p className="mt-3 text-xs text-gray-500">
                            This page does not constitute legal advice. The argument is diagnostic: the primitive changes what labor law is asked about; what follows is a policy question, not a mechanism one.
                        </p>
                    </div>
                    <a
                        href="/papers/figaro-labor-law.pdf"
                        className="shrink-0 inline-flex items-center justify-center px-6 py-3 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-900 transition-colors"
                    >
                        Download paper (F) &rarr;
                    </a>
                </div>
                <div className="mt-8 text-sm text-gray-500">
                    <p>
                        Companion reading:&nbsp;
                        <Link href="/legal" className="underline hover:text-black transition-colors">
                            the electronic-evidence paper
                        </Link>
                        &nbsp;treats dispute-resolution questions;&nbsp;
                        <Link href="/economics" className="underline hover:text-black transition-colors">
                            the institutional-economics paper
                        </Link>
                        &nbsp;treats the same subordination shift in the TCE register. Full set:&nbsp;
                        <Link href="/research" className="underline hover:text-black transition-colors">
                            research index
                        </Link>.
                    </p>
                </div>
            </section>

        </>
    );
}
