import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperRun,
    PaperSection,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Code Is Constitution — Figaro",
    description:
        "We argue that a sufficiently abstract protocol, whose rules hold a simple set of invariants, is a building block that secures, process by process, any economic system composed over it and gives the language of a constitution in which the laws of those systems are legislated, which moves the code-is-law debate down one layer.",
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
                        In 2016 the Ethereum community forked its own chain to reverse the drain of The DAO, an investment fund run by smart contracts. The normative reading of <em>code is law</em>, that a program&rsquo;s execution is the agreement, lost its own argument. A sufficiently abstract protocol holds a simple set of invariants, properties its rules keep on every execution, and those invariants name no good, no party, no price, and no end. They make it a building block that secures, process by process, any economic system composed over it, and they give the language of a constitution, in which the laws of each economic system are then legislated. The worked instance is a trade protocol whose mechanism has two operations. At commit each party&rsquo;s own bond makes its promise good before the trade, twice the payment from the buyer and twice the cumulative value from each seller. A process is one buyer&rsquo;s chain of orders. Only the buyer resolves, and resolution closes every order of the process at once. Under those invariants, for parties beyond each other&rsquo;s coercive reach, defection is strictly worse for the party that would choose it. The result holds given a buyer that resolves once performance has occurred and not before, and given the other sellers of the process performing. Disputes then move to the parties and their forums, outside the mechanism. With registration of terms open to any wallet, the invariants secure four of Fuller&rsquo;s eight principles of legality for the laws written over them, and possibility and congruence for themselves. The code-is-law debate then moves down one layer: code is neither law nor a rival to law, but the language in which the laws of an economic system are written.
                    </p>
                </>
            }
            references={
                <>
                    <li>Alston, Eric, Wilson Law, Ilia Murtazashvili, and Martin Weiss. 2022. &ldquo;Blockchain Networks as Constitutional and Competitive Polycentric Orders.&rdquo; <em>Journal of Institutional Economics</em> 18 (5): 707&ndash;723. https://doi.org/10.1017/S174413742100093X.</li>
                    <li>Buchanan, James M., and Gordon Tullock. 1962. <em>The Calculus of Consent: Logical Foundations of Constitutional Democracy</em>. Ann Arbor: University of Michigan Press.</li>
                    <li>De Filippi, Primavera, and Aaron Wright. 2018. <em>Blockchain and the Law: The Rule of Code</em>. Cambridge, MA: Harvard University Press. https://doi.org/10.4159/9780674985933.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. Accessed October 18, 2026. https://figaroprotocol.com/papers/asymmetric-bonding/.</li>
                    <li>Fuller, Lon L. 1964. <em>The Morality of Law</em>. New Haven, CT: Yale University Press.</li>
                    <li>Hart, H. L. A. 1961. <em>The Concept of Law</em>. Oxford: Clarendon Press.</li>
                    <li>Lessig, Lawrence. 1999. <em>Code and Other Laws of Cyberspace</em>. New York: Basic Books.</li>
                    <li>Milgrom, Paul R., Douglass C. North, and Barry R. Weingast. 1990. &ldquo;The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs.&rdquo; <em>Economics and Politics</em> 2 (1): 1&ndash;23. https://doi.org/10.1111/j.1468-0343.1990.tb00020.x.</li>
                    <li>Murtazashvili, Ilia, Ali Palida, and Michael J. Madison. 2026. &ldquo;The Past, Present, and Future of Polycentric Legal Order: A Comparative Institutional Analysis of <em>Lex Mercatoria</em> and Blockchain.&rdquo; <em>Journal of Institutional Economics</em> 22: e2. https://doi.org/10.1017/S1744137425100386.</li>
                    <li>Ostrom, Elinor. 1990. <em>Governing the Commons: The Evolution of Institutions for Collective Action</em>. Cambridge: Cambridge University Press. https://doi.org/10.1017/CBO9780511807763.</li>
                    <li>Radin, Margaret Jane. 2012. <em>Boilerplate: The Fine Print, Vanishing Rights, and the Rule of Law</em>. Princeton, NJ: Princeton University Press.</li>
                    <li><em>Van Loon v. Department of the Treasury</em>, No. 23-50669 (5th Cir. Nov. 26, 2024). Accessed October 20, 2026. https://www.ca5.uscourts.gov/opinions/pub/23/23-50669-CV0.pdf.</li>
                    <li>Zamfir, Vlad. 2019. &ldquo;Against Szabo&rsquo;s Law, for a New Crypto Legal System.&rdquo; <em>Crypto Law Review</em> (Medium), January 26, 2019. Accessed October 23, 2026. https://medium.com/cryptolawreview/against-szabos-law-for-a-new-crypto-legal-system-d00d0f3d3827. Archived by the Internet Archive, March 17, 2019, https://web.archive.org/web/20190317143303/https://medium.com/cryptolawreview/against-szabos-law-for-a-new-crypto-legal-system-d00d0f3d3827.</li>
                </>
            }
        >
            <PaperSection title="1. A Slogan That Lost Its Own Argument">
                <p>
                    &ldquo;Code is law&rdquo; entered the culture through Lawrence Lessig, who meant it descriptively: software architecture regulates behavior the way law, markets, and norms do, and deserves the same scrutiny (Lessig 1999). Crypto inverted the claim into a normative one. On that reading the program&rsquo;s execution <em>is</em> the agreement, final and beyond appeal.
                </p>
                <p>
                    The inversion failed within its first decade. When The DAO was drained in 2016, the Ethereum community did not accept the execution as the agreement: it forked the chain and unwound the result. Zamfir (2019) calls the fork a clear violation of &ldquo;Szabo&rsquo;s law&rdquo;: the maxim that a chain&rsquo;s rules change only for technical maintenance. He reports that it led Nick Szabo to disown Ethereum for the chain that kept the original history. The code had been read as the last word, and a community overruled it.
                </p>
                <PaperRun title="The claim.">
                    The debate put its question to the wrong layer. A sufficiently abstract protocol holds a simple set of invariants, properties its rules keep on every execution, and those invariants name no good, party, price, or end. They make it a building block that secures, process by process, any economic system composed over it. They also give the language of a constitution (Section 2 defines the term), in which the laws of those systems are legislated. Code, on this reading, is neither law nor a rival to law: it is the layer beneath the laws, and the debate moves down to it. Section 4 states the claim as a proposition and argues it.
                </PaperRun>
                <p>
                    The claim moves past three readings: Lessig&rsquo;s, above, and two more. De Filippi and Wright named the rules such systems administer <em>lex cryptographia</em>, a body of rules executed by code and operating alongside state law (De Filippi and Wright 2018). Alston et al. (2022) read blockchain networks as constitutional and competitive polycentric orders (systems with many centers of decision and none supreme), whose constitution is the network&rsquo;s own governance. The claim above is our reply to the first two. Against the third, our constitution is not a chain&rsquo;s governance but the invariants of one protocol over the chain. We show what makes them one: their abstraction, their lawlike form, and the equilibrium they secure (a profile of moves in which no party gains by changing only its own).
                </p>
                <p>
                    Vlad Zamfir argued against Szabo&rsquo;s law and for a crypto legal system (Zamfir 2019). His premise is that legal systems are protocols for the management of disputes, their prevention included. We do not share the premise: a protocol can secure trade without managing its disputes. Under the invariants of Section 3, for parties beyond each other&rsquo;s coercive reach, defection (a unilateral deviation that changes the outcome) is strictly worse for the party that would choose it (Figaro 2026, Theorems 1 and 3). It holds under the conditions premise 3 of Section 4 states: a buyer that resolves only after performance, and the other sellers performing. Defection is one matter a legal system exists to adjudicate, and by this result the mechanism takes it off the docket.
                </p>
                <p>
                    What remains is honest disagreement, and the mechanism pushes it to the periphery: the judgments and forums that sit outside the mechanism&rsquo;s operations. Whether a delivery met the agreement is the buyer&rsquo;s judgment, and a forum&rsquo;s ruling when a party asks for one (Section 3). Zamfir also has governance disputes in view: disputes over whether to change a protocol. These find no object in the mechanism, because the mechanism has no operation that changes it. A changed mechanism is deployed anew beside the old, and a party adopts it only by committing to it. Governance disputes keep their object one layer down, in the chain beneath, which the scope leaves outside the claim.
                </p>
                <p>
                    One word is kept to one use. <em>Enforcement</em> names the institutions that make a promise good after the fact, by authority: a court, an arbitrator, a platform&rsquo;s support queue. The bond does something else: it makes a promise good before the trade. Where the parties play universal performance with resolution, the trade needs no enforcement against defection. Every other function of law stays where it stood.
                </p>
            </PaperSection>

            <PaperSection title="2. The Constitutional Shape">
                <p>
                    Constitutional political economy rests on a categorical distinction, owed to James Buchanan: choosing the <em>rules of the game</em> is a different act from making <em>moves within the game</em> (Buchanan and Tullock 1962). Elinor Ostrom found the same structure in self-governing commons: operational rules, nested in collective-choice rules, nested in constitutional rules (Ostrom 1990). H. L. A. Hart drew the corresponding line in legal theory. Primary rules govern conduct; secondary rules of recognition, change, and adjudication are how a system knows what its own law is (Hart 1961).
                </p>
                <p>
                    Four terms carry the argument, and each is defined here. An <em>invariant</em> is a property a protocol&rsquo;s rules hold on every execution, whoever the parties and whatever their terms. A protocol is <em>sufficiently abstract</em> when its invariants name no good, no party, no price, and no end, only signatures, amounts in a token (a unit of value the chain transfers), and the order of its operations. A <em>constitution</em> is the rule-choosing level just described: the secondary rules that fix how a rule is recognized and how it changes, with the entrenched limits that fix what no rule may do. A <em>law</em>, in this paper, is a rule of conduct made under a constitution, at Ostrom&rsquo;s collective-choice level and in Hart&rsquo;s primary sense.
                </p>
                <p>
                    The rule-maker of trade has moved before, and each time the rules were someone&rsquo;s. On one account, which its historians contest, merchants wrote the <em>lex mercatoria</em> and staffed their own courts; states later assimilated much of that custom into codes and common law (Murtazashvili, Palida, and Madison 2026). Milgrom, North, and Weingast (1990) show how the Champagne fairs&rsquo; traders excluded a defector after the fact: they queried the history of unpaid judgments that the judges of the Law Merchant, the <em>lex mercatoria</em>&rsquo;s courts, kept. That enforcement rested on a shared history, which strangers lack. The platform then drafted its counterparties&rsquo; terms itself, in boilerplate that replaces the rights the law would give its recipients with a scheme they never bargained over (Radin 2012).
                </p>
            </PaperSection>

            <PaperSection title="3. The Artifact Under Test">
                <p>
                    The artifact is a protocol for trade between strangers. Its unit is the <em>order</em>: one commitment between a buyer and a seller, signed by both. A <em>process</em> is a sequence of orders opened by one buyer, counted in one token, and closed together. The <em>mechanism</em> has two operations, both run by smart contracts on the chain. Commit accepts each order, and the buyer&rsquo;s resolution closes each process.
                </p>
                <p>
                    The bonds fix every party&rsquo;s payoffs. At commit the buyer bonds <Math>{"2P"}</Math>, twice the payment <Math>{"P"}</Math>, and the seller of each order bonds <Math>{"2G"}</Math>, twice the cumulative value <Math>{"G"}</Math> of the process through its order. At resolution every payment transfers and every bond is refunded at once, or none does. After performance a buyer that never resolves ends at <Math>{"-P"}</Math> against <Math>{"0"}</Math> for resolving. Under the conditions of premise 3 of Section 4, a seller that holds out ends at most at <Math>{"-G"}</Math> against <Math>{"+P"}</Math> for performing.
                </p>
                <p>
                    Four invariants are all the mechanism holds:
                </p>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>Two operations.</strong> Commit and resolve are the only operations that move a bond or a payment.</li>
                    <li><strong>Assent and bonds at commit.</strong> An order is admitted only when both named parties have signed the same commitment, before the deadline it carries and naming the process&rsquo;s one buyer, into a process not yet resolved; the same commitment is admitted once. The commitment carries the fingerprint of its agreement (a hash: a fixed-length digest of data, which any change to the data alters). The cumulative value it declares must equal exactly the running total of the process&rsquo;s payments, its own included. Its bonds <Math>{"2P"}</Math> and <Math>{"2G"}</Math> must arrive in full, in the process&rsquo;s one token, with a payment above zero.</li>
                    <li><strong>Buyer-only, atomic resolution.</strong> Only the buyer resolves, and resolution closes every order of the process or none.</li>
                    <li><strong>One path for a bond.</strong> A bond is refunded only at resolution; no timeout, vote, or forum moves it.</li>
                </ol>
                <p>
                    Above the mechanism sit the terms. A <em>clause</em> is one reusable term, a relationship between a buyer and a seller or between two sellers. An <em>agreement</em> is the clauses composed for one buyer&ndash;seller relationship, which the two parties complete and sign as their order&rsquo;s terms; the order carries the fingerprint of the agreement as completed for it, and each clause in it is named by the fingerprint it is registered under. An <em>assembly</em> composes agreements into one reusable design of a process. A <em>designer</em> is the wallet (a signing key and the balance it controls) that registered a clause, an agreement, or an assembly. Each is registered in public under the fingerprint of its content. Any wallet may register one, and an entry is never rewritten. Sellers bind assemblies, and a buyer opens a process by selecting one.
                </p>
                <p>
                    The chain holds fingerprints, never the terms. It holds, timestamped and immutable, the parties, the payments, the bonds, the cumulative value, the moment the buyer resolved, and the fingerprint of each order&rsquo;s agreement. The mechanism holds no test of performance.
                </p>
                <p>
                    A disagreement about what arrived is worked out at the periphery, while the process stands open. The parties may put it right before resolution. A forum asked to rule does so on the data a party produces, and it checks each document against a fingerprint fixed before any dispute arose. The buyer resolves once satisfied, and its resolution is its judgment of performance. That judgment is final within the mechanism, because the buyer alone resolves; a forum&rsquo;s ruling binds the parties outside it.
                </p>
            </PaperSection>

            <PaperSection title="4. A Sufficiently Abstract Protocol Is a Constitution">
                <PaperRun title="The claim.">
                    A sufficiently abstract protocol, whose mechanism holds a simple set of invariants, is a building block that secures, process by process, any economic system composed over it, and it gives the language of a constitution in which the laws of those systems are legislated.
                </PaperRun>
                <PaperRun title="What the argument rests on.">
                    The argument rests on ten premises. The first three state what the mechanism is and what it secures. (1) The mechanism holds the four invariants of Section 3 and nothing else (stipulated: the protocol&rsquo;s rules). (2) The invariants name no good, no party, no price, and no end: only signatures, amounts in one token, and the order of the two operations (stipulated: the protocol&rsquo;s rules). (3) Under the invariants, for parties beyond each other&rsquo;s coercive reach, universal performance with resolution is an equilibrium for any number of orders resolved together. Each seller&rsquo;s performance is its best response (the act that serves it best given the others&rsquo;). It is so given a buyer that resolves once performance has occurred and not before, and co-sellers (the other sellers of the process) that perform (Section 3). Every defection, a unilateral deviation that changes the outcome, is strictly worse for the party making it (Figaro 2026, Theorems 1 and 3).
                </PaperRun>
                <p>
                    Two state who stands over the code and over its terms. (4) The mechanism&rsquo;s code executes as deployed for every caller, its deployers included. No party can change it, and anyone can deploy that code again (stipulated: the protocol&rsquo;s rules). In <em>Van Loon v. Department of the Treasury</em> (2024) the Fifth Circuit held that such immutable smart contracts are not property the Treasury may block under its sanctions statute, because no one can own them. (5) Any wallet may register a clause, an agreement, or an assembly under the fingerprint of its content; an entry is never rewritten, so a changed term is a new term under a new fingerprint (stipulated: the protocol&rsquo;s rules).
                </p>
                <p>
                    Two come from the theory of constitutions and of law. (6) Choosing rules differs from acting under them, and operational rules nest in collective-choice rules, which nest in constitutional rules (Buchanan and Tullock 1962; Ostrom 1990). A system&rsquo;s rule of recognition fixes what counts as its law, its rule of change how that law is made (Hart 1961). (7) Rules are lawlike when they are general, public, prospective, clear, non-contradictory, possible to follow, constant over time, and <em>congruent</em>, the rule as applied being the rule as declared (Fuller 1964).
                </p>
                <p>
                    The last three are stipulated. (8) An economic system, in this paper, is a set of exchanges, each a payment by one party against value added by another under terms both accept, composed in some sequence (stipulated). (9) Every execution of the mechanism and every registered term is public, and anyone can replay an execution from public data (stipulated: the protocol&rsquo;s rules). (10) The mechanism&rsquo;s code executes as its published specification declares (stipulated; the falsifier&rsquo;s fourth clause states what would refute it).
                </p>
                <PaperRun title="How the argument runs.">
                    The argument takes five steps. Step 1 derives universality from abstraction. By premises 1, 2, and 8, every exchange of an economic system can be written as an order with an agreement, and every economic system as a set of processes over assemblies. The invariants hold no field in which a system&rsquo;s ends could be written. A market-liberal assembly, a cooperative one, and a mutual-aid one therefore run on the same mechanism and differ in their terms alone.
                </PaperRun>
                <p>
                    Step 2 shows that the invariants secure what is composed over them. By premises 1 and 3, each order&rsquo;s promise is made good before the trade by bonds locked at commit, between strangers who share no history. By premise 4, no party can alter the invariants beneath a system once it runs. Because anyone can deploy the code again, a party escapes capture by exit. If the chain beneath is captured, it leaves for another chain; if a layer over the mechanism is captured, such as an interface or a registry parties rely on, it leaves for another layer. Each promise is thus made good by its own bond, under invariants no party can alter and any party can carry elsewhere. The invariants therefore secure what is composed over them, process by process.
                </p>
                <p>
                    Step 3 shows that the laws written over the invariants are lawlike. By premises 1, 5, 7, 9, and 10, the invariants and open registration secure four of Fuller&rsquo;s principles for the laws written over them. The laws are general and public: the same invariants bind every party, and every term and every execution are public. They are prospective and constant: a registered term is identified by its content and never rewritten, so no party is bound by an edit made after it signed. Possibility and congruence the invariants secure for themselves alone. The mechanism demands of a party only that it sign and fund its bond, and it admits no order its rules forbid. Its bond schedule and its transfers at resolution execute exactly as the published specification declares.
                </p>
                <p>
                    The invariants do not secure the rest. A clause can still demand what no party can do, and whether a delivery met it is judged at the periphery (Section 3). A clause&rsquo;s own possibility and congruence therefore rest on its designer and its forum. Clarity and non-contradiction the invariants do not secure either. Publication makes a term readable, not understood, and two clauses composed into one agreement could conflict. Both rest on the designer who writes and composes the clauses and on the parties who read them before they sign.
                </p>
                <p>
                    Step 4 reads the invariants as a constitution and the terms as its laws. By premises 1, 5, and 6, the invariants and open registration are secondary rules. The second invariant is the rule of recognition: a term is a term of the system, binding its parties, when both have signed the fingerprint of their agreement as completed for their order and the bonds have arrived. Registration publishes each clause and each design under the fingerprint of its content, so a party reads what it signs before it signs. An agreement of unregistered clauses binds its two parties as a private contract, outside the laws and outside the publicity of Step 3, which holds of registered terms.
                </p>
                <p>
                    Open registration is the rule of change: anyone may propose a new term, and nobody may rewrite one already relied upon. Two operations and one path for a bond fix what no rule may do. Hart&rsquo;s third secondary rule, adjudication, has no counterpart in the invariants; it sits at the periphery (Section 3). The clauses, agreements, and assemblies registered over the invariants are rules of conduct: laws legislated in that language. Each is written as clauses and binds only through two signatures, and by Step 2 the bonds make it good.
                </p>
                <p>
                    Step 5 moves the debate down a layer. By Steps 1 to 4, the code holds no rule of conduct, so it is neither law nor a rival to law; it fixes the language in which rules of conduct are written. TCP/IP fixes how a packet is addressed and delivered and says nothing of what it carries, and every application is written over it. The invariants fix how a promise is committed and closed and say nothing of what is traded, and every economic system of premise 8 is written over them.
                </p>
                <PaperRun title="Conclusion.">
                    By Steps 1 to 5, a sufficiently abstract protocol, whose mechanism holds a simple set of invariants, is a building block that secures, process by process, any economic system composed over it, and it gives the language of a constitution in which the laws of those systems are legislated. The code-is-law debate moves down one layer.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The claim is false if any of five things is shown. The first is an operation other than commit and the buyer&rsquo;s resolve that moves a bond. The second is a rule of the mechanism that names a good, a party, a price, or an end. The third is an economic system of premise 8 that the invariants cannot express without a decision point, a third party whose judgment the chain waits on, added to the chain. The fourth is an execution that departs from the published specification and stands. The fifth, under the scope&rsquo;s conditions, is a defection from universal performance with resolution that pays the party making it.
                </PaperRun>
                <PaperRun title="Scope.">
                    The proposition establishes a layer and its form, and &ldquo;any economic system&rdquo; ranges over premise 8&rsquo;s definition. It assumes the parties of Figaro (2026): each ranks outcomes by its payoffs at the value both signed, knows the schedule of transfers and the two operations, and stands beyond the other&rsquo;s coercive reach. Each process carries a positive payment in one token, and each party can fund its bond. The equilibrium covers defection, not honest disagreement; honest disagreement and the forums that rule on it sit at the periphery, outside the claim. The seller&rsquo;s comparison holds only under premise 3&rsquo;s conditions on the buyer&rsquo;s plan and its co-sellers&rsquo; performance.
                </PaperRun>
                <p>
                    The claim stops at four further edges. The security is per process, and exposure a party carries between processes is its own. What Step 3 leaves to designers and forums lies outside the claim, and the constitution binds only those who sign. State law is not displaced: taxes, licenses, and consumer protection reach the actors at the edges as before, and read the data a process leaves. The invariants inherit the security of the chain beneath them. Capture of that chain lies outside the claim, and so does a community&rsquo;s re-founding of it, as in the fork of Section 1; exit to another chain (Step 2) is what a party does about either.
                </p>
                <p>
                    Three objections remain, to Steps 3, 4, and 2 in that order. Is congruence then true by definition, since a deterministic program applies its bugs as faithfully as its rules? It is not, because congruence relates two public objects: the rules, published as a specification apart from the code, and the code&rsquo;s executions, each held on a public chain. By premise 9 anyone can replay every execution from public data. A bond taken or a transfer made other than as the specification declares is therefore a departure anyone can exhibit, never a rule the program silently applies; this is the falsifier&rsquo;s fourth clause. Where judgment enters, congruence is decided at the periphery (Section 3), on the data.
                </p>
                <p>
                    Can a protocol that binds only those who sign be a constitution, when constitutions bind persons who never consented? It is the constitution of a voluntary order: rules chosen by those they bind. Buchanan and Tullock (1962) analyze that case. Murtazashvili, Palida, and Madison (2026) trace its polycentric lineage from the <em>lex mercatoria</em> into blockchain. Each order is a contract; the invariants are the rules under which every such contract is recognized. Once committed, a seller cannot leave, and the buyer leaves only by resolving the whole process, since every bond is refunded only then. That bond makes keeping the promise each party&rsquo;s best move, under premise 3&rsquo;s conditions.
                </p>
                <p>
                    Does exit not cost the participants who leave a captured chain or layer? It does: exit forgoes the other participants and the data they share, and that cost is the price of the exit Step 2 credits. A captured chain or layer empties only as far as its participants judge the capture worse than that price. The mechanism itself offers capture no lever, since no party can change it.
                </p>
            </PaperSection>

            <PaperSection title="5. The Debate Moves Down a Layer">
                <p>
                    Code is not law in the state&rsquo;s sense: enacted by legislatures, applied with discretion, and backed by force. Nor is the code of such a protocol a rival law. It is the language beneath the laws: its invariants fix how any promise is made good before the trade. The laws of each economic system are the clauses, agreements, and assemblies its designers legislate in that language, bound by the sellers and selected by the buyers who use them. The question the code-is-law debate asked of the code, whether its execution is the agreement, belongs to those laws and to the parties who write and sign them. A regulator puts that question to the actors at the edges, while the invariants beneath stay neutral.
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
