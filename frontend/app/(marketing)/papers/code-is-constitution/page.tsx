import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperRun,
    PaperSection,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Code Is Constitution — Figaro Protocol",
    description:
        "We argue that a sufficiently abstract protocol, whose rules hold a simple set of invariants, is a building block that secures any economic system composed over it and gives the language of a constitution in which the laws of those systems are legislated, which moves the code-is-law debate down one layer.",
});

export default function CodeIsConstitutionPaper() {
    return (
        <PaperLayout slug="code-is-constitution"
            title="Code Is Constitution"
            subtitle="The Entrenched Layer Beneath Enactment"
            author="Figaro"
            date="July 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        In 2016 the Ethereum community forked its own chain to reverse the drain of The DAO, an investment fund run by smart contracts, and the normative reading of <em>code is law</em>, that a program&rsquo;s execution is the agreement, lost its own argument. We argue that the debate put its question to the wrong layer. A sufficiently abstract protocol, one whose rules name no good, no party, no price and no end, holds a simple set of invariants, and those invariants make it a building block that secures any economic system composed over it. Such a protocol gives the language of a constitution, in which the laws of each economic system are then legislated. We state the claim as a proposition and argue it over a trade protocol whose mechanism has two operations. At commit each party&rsquo;s own bond makes its promise good before the trade, twice the payment from the buyer and twice the cumulative value from each seller. Resolve, which only the buyer may call, closes every order of the process at once. Under those invariants defection is strictly worse for the party that would choose it, given a buyer that resolves once performance has occurred and not before, and co-sellers that perform, so disputes move to the periphery. Together with open registration the invariants secure seven of Fuller&rsquo;s eight principles of legality for the laws written over them, the eighth, non-contradiction, falling to those laws&rsquo; designers. The code-is-law debate then moves down one layer: code is neither law nor a rival to law, but the language in which the laws of an economic system are written.
                    </p>
                </>
            }
            references={
                <>
                    <li>Alston, Eric, Wilson Law, Ilia Murtazashvili, and Martin Weiss. 2022. &ldquo;Blockchain Networks as Constitutional and Competitive Polycentric Orders.&rdquo; <em>Journal of Institutional Economics</em> 18 (5): 707&ndash;723. https://doi.org/10.1017/S174413742100093X.</li>
                    <li>Buchanan, James M., and Gordon Tullock. 1962. <em>The Calculus of Consent: Logical Foundations of Constitutional Democracy</em>. Ann Arbor: University of Michigan Press.</li>
                    <li>De Filippi, Primavera, and Aaron Wright. 2018. <em>Blockchain and the Law: The Rule of Code</em>. Cambridge, MA: Harvard University Press. https://doi.org/10.4159/9780674985933.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Fuller, Lon L. 1964. <em>The Morality of Law</em>. New Haven, CT: Yale University Press.</li>
                    <li>Hart, H. L. A. 1961. <em>The Concept of Law</em>. Oxford: Clarendon Press.</li>
                    <li>Lessig, Lawrence. 1999. <em>Code and Other Laws of Cyberspace</em>. New York: Basic Books.</li>
                    <li>Milgrom, Paul R., Douglass C. North, and Barry R. Weingast. 1990. &ldquo;The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs.&rdquo; <em>Economics and Politics</em> 2 (1): 1&ndash;23. https://doi.org/10.1111/j.1468-0343.1990.tb00020.x.</li>
                    <li>Murtazashvili, Ilia, Ali Palida, and Michael J. Madison. 2026. &ldquo;The Past, Present, and Future of Polycentric Legal Order: A Comparative Institutional Analysis of <em>Lex Mercatoria</em> and Blockchain.&rdquo; <em>Journal of Institutional Economics</em> 22: e2. https://doi.org/10.1017/S1744137425100386.</li>
                    <li>Ostrom, Elinor. 1990. <em>Governing the Commons: The Evolution of Institutions for Collective Action</em>. Cambridge: Cambridge University Press. https://doi.org/10.1017/CBO9780511807763.</li>
                    <li>Radin, Margaret Jane. 2012. <em>Boilerplate: The Fine Print, Vanishing Rights, and the Rule of Law</em>. Princeton, NJ: Princeton University Press.</li>
                    <li><em>Van Loon v. Department of the Treasury</em>, No. 23-50669 (5th Cir. Nov. 26, 2024). https://www.ca5.uscourts.gov/opinions/pub/23/23-50669-CV0.pdf. Accessed October 20, 2026.</li>
                    <li>Zamfir, Vlad. 2019. &ldquo;Against Szabo&rsquo;s Law, for a New Crypto Legal System.&rdquo; <em>Crypto Law Review</em> (Medium), January 26, 2019. https://medium.com/cryptolawreview/against-szabos-law-for-a-new-crypto-legal-system-d00d0f3d3827. Archived by the Internet Archive, March 17, 2019, https://web.archive.org/web/20190317143303/https://medium.com/cryptolawreview/against-szabos-law-for-a-new-crypto-legal-system-d00d0f3d3827. Accessed October 23, 2026.</li>
                </>
            }
        >
            <PaperSection title="1. A Slogan That Lost Its Own Argument">
                <p>
                    &ldquo;Code is law&rdquo; entered the culture through Lawrence Lessig, who meant it descriptively: software architecture regulates behavior the way law, markets, and norms do, and deserves the same scrutiny (Lessig 1999). Crypto inverted the claim into a normative one. On that reading the program&rsquo;s execution <em>is</em> the agreement, final and beyond appeal.
                </p>
                <p>
                    The inversion failed within its first decade. When The DAO was drained in 2016, the Ethereum community did not accept the execution as the agreement: it forked the chain and unwound the result. Zamfir (2019) calls the fork a clear violation of &ldquo;Szabo&rsquo;s law&rdquo;, the maxim that a chain&rsquo;s rules change only for technical maintenance, and reports that it led Nick Szabo to disown Ethereum for the chain that kept the original history. The code had been read as the last word, and a community overruled it.
                </p>
                <PaperRun title="The claim.">
                    The debate put its question to the wrong layer. A sufficiently abstract protocol, whose rules hold a simple set of invariants, is a building block that secures any economic system composed over it, and it gives the language of a constitution in which the laws of those systems are legislated. Code, on this reading, is neither law nor a rival to law: it is the layer beneath the laws, and the debate moves down to it. Section 4 states the claim as a proposition, in six parts.
                </PaperRun>
                <p>
                    The claim moves past three readings: Lessig&rsquo;s, above, and two more. De Filippi and Wright named the rules such systems administer <em>lex cryptographia</em>, a body of rules executed by code and operating alongside state law (De Filippi and Wright 2018). Alston et al. (2022) read blockchain networks as constitutional and competitive polycentric orders, whose constitution is the network&rsquo;s own governance. We place the code one layer beneath Lessig&rsquo;s reading and De Filippi and Wright&rsquo;s: it is not a body of rules of conduct but the language in which such rules are written. Against the third, our constitution is not a chain&rsquo;s governance but the invariants of one protocol over the chain, and we show what makes them one: their abstraction, the equilibrium they secure, and their lawlike form.
                </p>
                <p>
                    Vlad Zamfir argued against that maxim and for a crypto legal system, on the premise that legal systems are protocols for the management of disputes, their prevention included (Zamfir 2019). We do not share the premise. A protocol can secure trade without managing its disputes, because under the invariants of Section 3 defection, the matter a legal system exists to adjudicate, is strictly worse for the party that would choose it, given a buyer that resolves once performance has occurred and not before and, in a process of several orders, co-sellers that perform (Figaro 2026, Theorems 1 and 3). What remains is honest disagreement over whether a delivery met the agreement, and it is pushed to the periphery: the parties work it out while the process stands open. The result covers defection, not honest disagreement, and the seller&rsquo;s comparison is conditional on the buyer&rsquo;s plan and on its co-sellers&rsquo; performance. The governance disputes Zamfir has in view, over whether to change a protocol, find no object in the mechanism, which has no operation that changes it. A changed mechanism is deployed anew beside the old, and a party adopts it only by committing to it. They keep their object one layer down, in the chain beneath, which the scope leaves outside the claim.
                </p>
                <p>
                    One word is kept to one use. <em>Enforcement</em> names the institutions that make a promise good after the fact, by authority: a court, an arbitrator, a platform&rsquo;s support queue. The bond does something else: it makes a promise good before the trade. Where the parties play the equilibrium, the enforcement of that one bargain is needed far less, and every other function of law stays where it stood.
                </p>
            </PaperSection>

            <PaperSection title="2. The Constitutional Shape">
                <p>
                    Constitutional political economy rests on a categorical distinction, owed to James Buchanan: choosing the <em>rules of the game</em> is a different act from making <em>moves within the game</em> (Buchanan and Tullock 1962). Elinor Ostrom found the same structure in self-governing commons: operational rules, nested in collective-choice rules, nested in constitutional rules (Ostrom 1990). H. L. A. Hart drew the corresponding line in legal theory. Primary rules govern conduct; secondary rules of recognition, change, and adjudication are how a system knows what its own law is (Hart 1961).
                </p>
                <p>
                    Four terms carry the argument, and each is defined here. An <em>invariant</em> is a property a protocol&rsquo;s rules hold on every execution, whoever the parties and whatever their terms. A protocol is <em>sufficiently abstract</em> when its invariants name no good, no party, no price, and no end, only signatures, amounts in a token, and the order of its operations. A <em>constitution</em> is the rule-choosing level just described: the secondary rules that fix how a rule is recognized and how it changes, with the entrenched limits that fix what no rule may do. A <em>law</em>, in this paper, is a rule of conduct made under a constitution, at Ostrom&rsquo;s collective-choice level and in Hart&rsquo;s primary sense.
                </p>
                <p>
                    Trade has had rule-makers before. Merchants wrote the <em>lex mercatoria</em> and staffed their own courts; states later assimilated much of that custom into codes and common law (Murtazashvili, Palida, and Madison 2026). The platform then drafted its counterparties&rsquo; terms itself, in boilerplate that replaces the rights the law would give its recipients with a scheme they never bargained over (Radin 2012).
                </p>
            </PaperSection>

            <PaperSection title="3. The Artifact Under Test">
                <p>
                    The artifact is a protocol for trade between strangers. Its unit is the <em>order</em>: one commitment between a buyer and a seller, signed by both. A <em>process</em> is a sequence of orders opened by one buyer, counted in one token (a unit of value a contract on the chain issues and transfers), and closed together. The <em>mechanism</em> has two operations, commit and the buyer&rsquo;s resolution, run by smart contracts on the chain: commit accepts each order, and resolution closes each process. At commit the buyer bonds <Math>{"2P"}</Math>, twice the payment <Math>{"P"}</Math>, and the seller of each order bonds <Math>{"2G"}</Math>, twice the cumulative value <Math>{"G"}</Math> of the process through its order. At resolution every payment transfers and every bond is refunded at once, or none does. After performance a buyer that never resolves ends at <Math>{"-P"}</Math> against <Math>{"0"}</Math> for resolving, and a seller that holds out ends at <Math>{"-G"}</Math> or worse against <Math>{"+P"}</Math> for performing.
                </p>
                <p>
                    Four invariants are all the mechanism holds:
                </p>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>Two operations.</strong> Commit and resolve are the only operations that move a bond or a payment.</li>
                    <li><strong>Assent and bonds at commit.</strong> An order is admitted only when both named parties have signed the same commitment, which carries the hash of its agreement (a fixed-length fingerprint of data, which any change to the data alters). Its bonds <Math>{"2P"}</Math> and <Math>{"2G"}</Math> must arrive in full, in the process&rsquo;s one token, with a payment above zero.</li>
                    <li><strong>Buyer-only, atomic resolution.</strong> Only the buyer resolves, and resolution closes every order of the process or none.</li>
                    <li><strong>One path for a bond.</strong> A bond is refunded only at resolution; no timeout, vote, or forum moves it.</li>
                </ol>
                <p>
                    Above the mechanism sit the terms. A <em>clause</em> is one reusable term, a relationship between a buyer and a seller or between two sellers. An <em>agreement</em> is the clauses composed for one order, and its fingerprint is what the order carries. An <em>assembly</em> composes agreements into one reusable design of a process. A <em>designer</em> is the wallet (a signing key and the balance it controls) that first registered a clause, an agreement, or an assembly, each registered in public under the fingerprint of its content. Any wallet may register one, and an entry is never rewritten. Sellers bind assemblies as standing offers, and a buyer opens a process by selecting one.
                </p>
                <p>
                    The chain holds fingerprints, never the terms. It holds, timestamped and immutable, the parties, the payments, the bonds, the cumulative value, the moment the buyer resolved, and the fingerprint of each order&rsquo;s agreement. The mechanism holds no test of performance. A disagreement about what arrived is worked out while the process stands open. The parties agree a remedy before resolve, and a forum asked to rule does so on the data a party produces, checking each document against a fingerprint fixed before any dispute arose. The buyer resolves once satisfied, and resolution is terminal acceptance.
                </p>
            </PaperSection>

            <PaperSection title="4. A Sufficiently Abstract Protocol Is a Constitution">
                <PaperRun title="The claim.">
                    A sufficiently abstract protocol, whose mechanism holds a simple set of invariants, is a building block that secures any economic system composed over it, and it gives the language of a constitution in which the laws of those systems are legislated.
                </PaperRun>
                <PaperRun title="Premises.">
                    The argument uses ten.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>The invariants.</strong> The mechanism holds the four invariants of Section 3 and nothing else (stipulated: the protocol&rsquo;s rules).</li>
                    <li><strong>Abstraction.</strong> The invariants name no good, no party, no price, and no end: only signatures, amounts in one token, and the order of the two operations (stipulated: the protocol&rsquo;s rules).</li>
                    <li><strong>The equilibrium.</strong> Under the invariants, universal performance with resolution is an equilibrium for any number of orders the network resolves in one call: each seller&rsquo;s performance is its best reply given a buyer that resolves once performance has occurred and not before, and co-sellers that perform. Every deviation that changes the outcome is strictly worse for the party making it (Figaro 2026, Theorems 1 and 3).</li>
                    <li><strong>No party over the code.</strong> The mechanism&rsquo;s code executes as deployed for every caller, its deployers included, and no party can change it. A federal appellate court has held that such immutable smart contracts are not property the Treasury may block under its sanctions statute, because no one can own them (<em>Van Loon v. Department of the Treasury</em> 2024). Anyone can deploy that code again, so a captured chain beneath, or a captured surface over the mechanism, is escaped by exit (stipulated).</li>
                    <li><strong>Open registration of terms.</strong> Any wallet may register a clause, an agreement, or an assembly under the fingerprint of its content; an entry is never rewritten, so a changed term is a new term under a new identifier (stipulated: the protocol&rsquo;s rules).</li>
                    <li><strong>The constitutional level.</strong> Choosing rules differs from acting under them, and operational rules nest in collective-choice rules, which nest in constitutional rules (Buchanan and Tullock 1962; Ostrom 1990). A system&rsquo;s rule of recognition fixes what counts as its law, its rule of change how that law is made (Hart 1961).</li>
                    <li><strong>Legality.</strong> Rules are lawlike when they are general, public, prospective, clear, non-contradictory, possible to follow, constant over time, and <em>congruent</em>, the rule as applied being the rule as declared (Fuller 1964).</li>
                    <li><strong>Economic systems.</strong> An economic system, in this paper, is a set of exchanges, each a payment by one party against value added by another under terms both accept, composed in some order (stipulated).</li>
                    <li><strong>A public chain.</strong> Every execution of the mechanism and every registered term is public, and anyone can replay an execution from public data (stipulated: the protocol&rsquo;s rules).</li>
                    <li><strong>Congruence of code and specification.</strong> The mechanism&rsquo;s code executes as its published specification declares (stipulated; the falsifier&rsquo;s fourth clause states what would refute it).</li>
                </ol>
                <PaperRun title="Steps.">
                    The argument runs in five named steps.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>Abstraction gives universality.</strong> By premises 1, 2, and 8, every exchange of an economic system can be written as an order with an agreement, and every economic system as a set of processes over assemblies. The invariants hold no field in which a system&rsquo;s ends could be written. For instance, a market-liberal assembly, a cooperative one, and a mutual-aid one would run on the same mechanism and differ in their terms alone.</li>
                    <li><strong>The invariants secure what is composed over them.</strong> By premises 1 and 3, each order&rsquo;s promise is made good before the trade, by bonds locked at commit. By premise 4, no party can alter the invariants beneath a system once it runs. The Champagne fairs&rsquo; private judges excluded a defector after the fact, within a community bounded enough to remember him (Milgrom, North, and Weingast 1990); the bond works before the trade, between strangers who share no community. The invariants are therefore a building block that secures any system composed over them.</li>
                    <li><strong>The laws written over the invariants are lawlike.</strong> By premises 1, 5, 7, 9, and 10, the invariants and open registration secure seven of Fuller&rsquo;s principles for the laws written over them. The laws are general and public: the same invariants bind every party, and every term and every execution are public. They are prospective and constant: a registered term is identified by its content and never rewritten, so no party is bound by an edit made after it signed. They are clear in the sense publication gives: each is a fixed text every party can read before it signs. Possibility holds because the mechanism demands of a party only that it sign and fund its bond. Congruence holds because the mechanism admits no order its rules forbid, and the bond schedule and the transfers at resolution execute exactly as the published specification declares. Non-contradiction is the one principle the invariants do not secure: two clauses composed into one agreement could conflict, and consistency rests on the designer who composes them and the parties who read them before they sign.</li>
                    <li><strong>The invariants are a constitution, and the terms its laws.</strong> By premises 1, 5, and 6, the invariants and open registration are secondary rules. Registration under the hash of its content is the rule of recognition: a term is a term of the system when it is registered so, and it binds a party only when both parties have signed the hash of its agreement and the bonds have arrived. Open registration is the rule of change: anyone may propose a new term, and nobody may rewrite one already relied upon. Two operations and one path for a bond fix what no rule may do. Hart&rsquo;s third secondary rule, adjudication, has no counterpart in the invariants: whether a delivery met the agreement is the buyer&rsquo;s judgment and a forum&rsquo;s ruling, at the periphery (Section 1). The clauses, agreements, and assemblies registered over the invariants are rules of conduct, laws legislated in that language: each is written as clauses and binds only through two signatures, and by Step 2 it is made good by the bonds. Non-contradiction, left over by Step 3, is a duty of that legislation.</li>
                    <li><strong>The debate moves down a layer.</strong> By Steps 1 to 4, the code holds no rule of conduct, so it is neither law nor a rival to law; it fixes the language in which rules of conduct are written. TCP/IP fixes how a packet is addressed and delivered and says nothing of what it carries, and every application is written over it. The invariants fix how a promise is committed and closed and say nothing of what is traded, and every economic system of premise 8 is written over them.</li>
                </ol>
                <PaperRun title="Conclusion.">
                    By Steps 1 to 5, a sufficiently abstract protocol, whose mechanism holds a simple set of invariants, is a building block that secures any economic system composed over it, and it gives the language of a constitution in which the laws of those systems are legislated. The code-is-law debate moves down one layer.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The claim is false if any of five things is shown: an operation other than commit and the buyer&rsquo;s resolve that moves a bond; a rule of the mechanism that names a good, a party, a price, or an end; an economic system of premise 8 that the invariants cannot express without a decision point added to the chain; an execution that departs from the published specification and stands; or, under the scope&rsquo;s conditions, a deviation from universal performance with resolution that pays the party making it.
                </PaperRun>
                <PaperRun title="Scope.">
                    The proposition establishes a layer and its form, and &ldquo;any economic system&rdquo; ranges over premise 8&rsquo;s definition. It assumes the parties of Figaro (2026): each ranks outcomes by its payoffs at the value both signed, knows the schedule of transfers and the two operations, and stands beyond the other&rsquo;s coercive reach. Each process carries a positive payment in one token, and each party can fund its bond. The equilibrium covers defection, not honest disagreement, and the seller&rsquo;s comparison is conditional on the buyer&rsquo;s plan and on its co-sellers&rsquo; performance. Honest disagreement and the forums that rule on it sit at the periphery, outside the claim. Non-contradiction among the laws is left to their designers, and the constitution binds only those who sign. State law is not displaced: taxes, licenses, and consumer protection reach the actors at the edges as before, and read the data a process leaves. The invariants inherit the security of the chain beneath them, so capture of that chain, and a community&rsquo;s re-founding of it, as in the fork of Section 1, lie outside them.
                </PaperRun>
                <p>
                    Is congruence then true by definition, since a deterministic program applies its bugs as faithfully as its rules? It is not, because congruence relates two public objects: the rules, published as a specification apart from the code, and the code&rsquo;s executions, each held on a public chain. Every execution can be replayed by anyone from public data. A bond taken or a transfer made other than as the specification declares is therefore a departure anyone can exhibit, never a rule the program silently applies; this is the falsifier&rsquo;s fourth clause. Where judgment enters, whether a delivery met the agreement, congruence is what the buyer&rsquo;s judgment and a forum&rsquo;s ruling make of the data.
                </p>
                <p>
                    Can a protocol that binds only those who sign be a constitution, when constitutions bind persons who never consented? It is the constitution of a voluntary order: rules chosen by those they bind, the case Buchanan and Tullock (1962) analyze, and the polycentric lineage of the <em>lex mercatoria</em> that Murtazashvili, Palida, and Madison (2026) trace into blockchain. Each order is a contract; the invariants are the rules under which every such contract is recognized. Once committed, a party cannot leave, since its bond is refunded only when the buyer resolves. That bond is what makes keeping the promise each party&rsquo;s best move while the others keep theirs.
                </p>
                <p>
                    Does exit not cost the participants who leave a captured chain or surface? It does: exit forgoes the network&rsquo;s participants and data, and that cost is the price of the exit premise 4 credits. A captured chain or surface empties only as far as its participants judge the capture worse than that price. The mechanism itself offers capture no lever, since no party can change it.
                </p>
            </PaperSection>

            <PaperSection title="5. The Debate Moves Down a Layer">
                <p>
                    Code is not law in the slogan&rsquo;s sense, the state&rsquo;s law, enacted by legislatures, applied with discretion, and backed by force. Nor is the code of such a protocol a rival law. It is the language beneath the laws: its invariants fix how any promise is made good before the trade. The laws of each economic system are the clauses and assemblies its designers legislate in that language, bound by the sellers and selected by the buyers who use them. The question the code-is-law debate asked of the code, whether its execution is the agreement, belongs to those laws and to the parties who write and sign them. A regulator puts that question to the actors at the edges, while the invariants beneath stay neutral.
                </p>
            </PaperSection>

            <PaperSection title="Acknowledgments">
                <p>
                    We thank Vlad Zamfir and Primavera De Filippi, whose years of conversation and collaboration shaped the questions this paper tries to answer. The errors are ours alone.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
