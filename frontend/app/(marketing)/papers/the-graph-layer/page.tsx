import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { PaperLayout, PaperSection, PaperRun, PaperRemark } from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Graph Layer — Figaro Protocol",
    description:
        "Above a mechanism that fixes only the bonds and the buyer's resolution, who a party is to a trade, which market it stands in, which community it belongs to and which law the parties chose are derived from signed data, stored by no party, and read under the open-world assumption.",
});

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

export default function TheGraphLayerPaper() {
    return (
        <PaperLayout
            slug="the-graph-layer"
            title="The Graph Layer"
            subtitle="Economic Form Read from Signed Data Under the Open-World Assumption"
            author="Figaro"
            date="October 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        A platform answers &ldquo;is this wallet a courier?&rdquo; from its roster. We study a setting with none: a mechanism that fixes two bonds and the buyer&rsquo;s resolution and reads no term. The buyer locks twice the payment, each seller twice the value accumulated through its order, and only the buyer resolves, every order at once. Above that mechanism lies a graph: the designs wallets publish, the bindings sellers declare, the selections buyers make, and the orders the parties sign. We argue that who a party is to a trade, which market it stands in, which community it belongs to and which law the parties chose are derivations from signed data. That data is the composed clauses, the topology the parties signed, the tokens a wallet holds and the attestations it filed. No stored copy of these readings is an input to the mechanism, and none gates a trade. They are read under the open-world assumption: what is not stated is unknown, and any wallet may publish it. The door a designer&rsquo;s token opens is read from the balances both parties must lock, and no party admits anyone through it beyond what the token&rsquo;s own issuer can do to balances. A clause composes the graph with law without the mechanism reading it. The reading has a price: what the mechanism enforces is fixed, while a role, a market or a community is a derivation, and two readers who derive differently share no privileged seat. The falsifier is a form of trade that needs a list kept by a party standing over the trade.
                    </p>
                </>
            }
            references={
                <>
                    <li>Figaro. 2026a. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 29, 2026.</li>
                    <li>Figaro. 2026b. &ldquo;Coordination Substrates: Firm, Court, and Bond: A Comparative Institutional Analysis of Trade Between Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/coordination-substrates/. Accessed October 29, 2026.</li>
                    <li>Figaro. 2026c. &ldquo;Figaro as a Cryptoeconomic System: Three Costs of Trade Between Strangers, Read Against the Field&rsquo;s Three Definitions.&rdquo; Preprint. https://figaroprotocol.com/papers/figaro-as-a-cryptoeconomic-system/. Accessed October 29, 2026.</li>
                    <li>Figaro. 2026d. &ldquo;Markets Without a Venue: Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Mechanism.&rdquo; Preprint. https://figaroprotocol.com/papers/markets-without-a-venue/. Accessed October 29, 2026.</li>
                    <li>Figaro. 2026e. &ldquo;The Ungoverned Substrate: Network States, Holacracy, On-Chain Governance, the Ethereum Mandate, the Cypherpunks, and d/acc: The Ex-Post Frame They Share, and a Commercial Layer With No Seat.&rdquo; Preprint. https://figaroprotocol.com/papers/ungoverned-substrate/. Accessed October 29, 2026.</li>
                    <li>Granovetter, Mark. 1985. &ldquo;Economic Action and Social Structure: The Problem of Embeddedness.&rdquo; <em>American Journal of Sociology</em> 91 (3): 481&ndash;510. https://doi.org/10.1086/228311.</li>
                    <li>Hayek, F. A. 1945. &ldquo;The Use of Knowledge in Society.&rdquo; <em>American Economic Review</em> 35 (4): 519&ndash;530. https://www.jstor.org/stable/1809376.</li>
                    <li>Jackson, Matthew O. 2008. <em>Social and Economic Networks</em>. Princeton, NJ: Princeton University Press. https://doi.org/10.1515/9781400833993.</li>
                    <li>Kranton, Rachel E., and Deborah F. Minehart. 2001. &ldquo;A Theory of Buyer-Seller Networks.&rdquo; <em>American Economic Review</em> 91 (3): 485&ndash;508. https://doi.org/10.1257/aer.91.3.485.</li>
                    <li>Ostrom, Elinor. 2010. &ldquo;Beyond Markets and States: Polycentric Governance of Complex Economic Systems.&rdquo; <em>American Economic Review</em> 100 (3): 641&ndash;672. https://doi.org/10.1257/aer.100.3.641.</li>
                    <li>Reiter, Raymond. 1978. &ldquo;On Closed World Data Bases.&rdquo; In <em>Logic and Data Bases</em>, edited by Herv&eacute; Gallaire and Jack Minker, 55&ndash;76. New York: Plenum Press. https://doi.org/10.1007/978-1-4684-3384-5_3.</li>
                </>
            }
        >
            <PaperSection title="1. Where Is the Form of a Trade Kept?">
                <p>
                    Stipulate a wallet <Math>{"W"}</Math> that signs two orders in one day. In the first, <Math>{"W"}</Math> is the seller, and its order follows a kitchen&rsquo;s and carries a clause for the stages of carrying a parcel. In the second, <Math>{"W"}</Math> is the buyer of an inspection. Is <Math>{"W"}</Math> a courier? A platform answers from its roster of couriers, and a firm from its payroll. Both answers are stored, and the party that stores them decides who may trade, in what role, and on what terms.
                </p>
                <p>
                    The accounts that place the guarantee of a stranger&rsquo;s promise in a party over the trade also place the form of the trade there. The firm, the platform and the court each make the promise good as every ex-post form does, by an authority that acts after the failure (Figaro 2026b). The firm and the platform keep the list that goes with that authority: of employees, of admitted sellers. Not every account works this way. Granovetter (1985) places economic action in ongoing structures of social relations, and Ostrom (2010) places governance in many centers of decision, none of them over the rest. Network economics takes the links themselves as the object. Kranton and Minehart (2001) model buyers and sellers who form links before they can trade, and Jackson (2008) treats such networks as the analyst&rsquo;s object, drawn whole.
                </p>
                <p>
                    Our setting removes the party over the trade and gives no one the network whole. The mechanism makes a promise good before the trade, for parties beyond each other&rsquo;s coercive reach, with a bond each party locks. It reads no term. Where, then, does the form of a trade live, and what holds the list of who is what? That the economic form of a trade is a property of the graph composed above such a mechanism is argued elsewhere (Figaro 2026c). That the question of who governs moves to the same graph is argued elsewhere too (Figaro 2026e). This paper takes neither as its claim. It asks what the graph is made of, who holds it, and how it is read.
                </p>
                <p>
                    Our claim is that the form of a trade is read from signed data, and that no stored reading of it gates a trade. Section 2 defines the graph, and Section 3 states the claim as Proposition 1 and argues it. Sections 4 and 5 apply it to the door a token opens and to law, and Section 6 prices the reading.
                </p>
            </PaperSection>

            <PaperSection title="2. The Graph">
                <p>
                    The mechanism beneath has two operations. At <em>commit</em> a buyer and a seller both sign one commitment, which names the parties, the token, the payment <Math>{"P"}</Math>, the process&rsquo;s running value and the fingerprint of the agreement&rsquo;s terms. The buyer locks <Math>{"2P"}</Math> and the seller <Math>{"2G"}</Math>, where <Math>{"G"}</Math> is the value accumulated through its own order: its payment and every payment committed before it. At <em>resolution</em> the buyer alone closes every order of the process at once. Each seller is paid and every bond refunded, the buyer&rsquo;s less the payments it carried. A <em>process</em> is the chain of orders one buyer opens, and at the mechanism it is linear: a sequence of commitments raising one running value. The mechanism reads the figures and the fingerprint, never the terms.
                </p>
                <p>
                    The graph is everything composed above that mechanism, and it has the following parts.
                </p>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>Nodes.</strong> Each node is the wallet of an asset, through which the asset trades for itself: a person&rsquo;s labor, a machine, a plant, a community, an agent. The mechanism sees only the wallet, and any wallet that can sign and lock its bond is a party.</li>
                    <li><strong>Clauses.</strong> A clause is one relationship, buyer to seller or seller to seller, with fields whose values the agreement carries. An <em>agreement</em> is the clauses composed for one order. Its fingerprint, the root of a merkle tree with one leaf per clause, is what the commitment carries. Any one term can therefore be shown against it by an <em>inclusion proof</em>: the term&rsquo;s leaf and the sibling hashes that recompute the root.</li>
                    <li><strong>Topology.</strong> Who comes before whom is itself a clause, stated in each order&rsquo;s agreement and signed by its two parties. The mechanism sees the linear chain of commitments; a branching structure of who follows whom is reconstructed off-chain from the signed topology.</li>
                    <li><strong>Designs.</strong> A design is a reusable subgraph published by a wallet: a clause, an agreement registered value-free, or an <em>assembly</em>, the agreements composed into a reusable design of a process. Each design is published to content-addressed storage and listed under its fingerprint. The <em>designer</em> of a design is the wallet that first registered it.</li>
                    <li><strong>Bindings and selections.</strong> A <em>binding</em> is a seller&rsquo;s standing declaration, published in its profile, that it trades under an assembly. Its counter-signature on one order is the acceptance, a separate act. A <em>selection</em> is a buyer&rsquo;s choice of an assembly, made by filling an agreement under it and signing the commitment.</li>
                    <li><strong>Attestations.</strong> An attestation is a statement a party signs about a clause of its agreement while the process is open. The chain keeps the hash of its content and checks who signed it, never whether it is true.</li>
                    <li><strong>Denominations and holdings.</strong> The <em>denomination</em> of a process is the one token in which its payments and bonds are made, named in the agreement every party signs. A wallet&rsquo;s holdings are its token balances, public chain state left by transfers it or others signed.</li>
                </ol>
                <p>
                    Two further terms are stipulated here. A <em>market</em> for a resource is the published market: the set of sellers that bind an assembly offering it and, for the order in view, hold <Math>{"2G"}</Math> of the process&rsquo;s denomination while the buyer holds <Math>{"2P"}</Math>. A <em>community</em> is a set of wallets that take part in the same designs and hold the same tokens, a signal around which communities form, though not the only one (Figaro 2026c). Both are definitions this paper makes, and Section 3 shows that each is computable from the parts above.
                </p>
            </PaperSection>

            <PaperSection title="3. The Form Is Derived, and No Stored Reading Gates a Trade">
                <FormalBlock label="Proposition 1 (Derived readings).">
                    <p>
                        Let a mechanism fix only the bonds and the buyer&rsquo;s resolution. Then who a party is to a trade, which market it stands in, which community it belongs to and which law the parties chose are derivations. They are derived from the composed clauses, the topology the parties signed, the tokens a wallet holds and the attestations it filed. No stored copy of them is an input to commit or to resolution, and none gates a trade. They are read under the open-world assumption: what is not stated is unknown, and any wallet may publish it.
                    </p>
                </FormalBlock>
                <PaperRun title="Premises.">
                    The argument uses five.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>The mechanism.</strong> The mechanism is as Section 2 states: commit and resolve are its only operations, and it reads figures and fingerprints, never clause content, and consults no listing. The chain holds fingerprints and attestation hashes. It accepts an attestation only from the process&rsquo;s buyer or one of its sellers, bound by proof to a clause of its agreement, before resolution (stipulated: the protocol&rsquo;s rules).</li>
                    <li><strong>Publication.</strong> Designs are published to content-addressed storage and listed under their fingerprints, and profiles are listed under their wallets. The listing is an open list kept by no party: no party admits or removes another&rsquo;s entry, and registering is how a wallet publishes, never how it qualifies (stipulated: the protocol&rsquo;s rules).</li>
                    <li><strong>The equilibrium.</strong> For parties beyond each other&rsquo;s coercive reach, after performance resolving is the buyer&rsquo;s strict preference, with no assumption about the seller. Given the buyer&rsquo;s plan to resolve once performance has occurred, and its co-sellers&rsquo; performance, performing is each seller&rsquo;s strict best response. Universal performance with resolution is an equilibrium at every order of a process chain (Figaro 2026a, Theorems 1 and 3).</li>
                    <li><strong>Holdings.</strong> Token balances are public chain state, and every payment and bond of a process is made in its denomination (stipulated: the protocol&rsquo;s rules).</li>
                    <li><strong>The open-world assumption.</strong> A statement absent from the published and signed data is unknown, not false, and any wallet may publish it. Reiter (1978) formalized the opposite, the closed-world assumption, under which a database answers queries as though every fact it lacks were false. We stipulate the open-world reading.</li>
                </ol>
                <PaperRun title="Step 1: a role is a position in the composed graph.">
                    A role is the position a wallet holds in what was composed and signed. In the stipulated case, <Math>{"W"}</Math> is the seller of an order that carries the parcel-carrying clause and follows the kitchen&rsquo;s order in the signed topology. &ldquo;Courier&rdquo; is the reading of that order, and in its second order the same wallet reads as a buyer. A modality, such as pickup or delivery to a door, is read the same way, from the clauses composed and the values filled. By premise 1 the chain holds none of these readings, only the signatures and fingerprints they are read from.
                </PaperRun>
                <PaperRun title="Step 2: a market and a community are computable from bindings, selections and holdings.">
                    A buyer finds sellers for a resource among the published bindings: the sellers that bind an assembly offering it. A trade at commit also needs both balances: the buyer must hold <Math>{"2P"}</Math> of the denomination and the seller <Math>{"2G"}</Math> (premise 4). The published market is therefore computed from the bindings under premise 2 and from balances. A direct counter-signature can always reach a seller outside it, because commit consults no listing (premise 1), the open-world point of Step 5. Taking part in a design is read from the bindings that name it and the selections made under it, and holding a token from balances. A community is therefore computed from the same data. Neither set is entered anywhere as a set, and each changes the moment a seller publishes a new binding or a wallet acquires the token.
                </PaperRun>
                <PaperRun title="Step 3: the law chosen and a variation are read from clauses and attestations.">
                    The law the parties chose is the value of a clause that names applicable law, a forum or a filing, filled and signed under the agreement&rsquo;s fingerprint. Whether the parties agreed a variation while the process stood open is read by comparing their attestations about the same clause. By premise 1 the chain checks who signed each and to which clause it is bound. The reader compares what they say.
                </PaperRun>
                <PaperRun title="Step 4: no stored reading is an input to the mechanism or gates a trade.">
                    None of the readings of Steps 1 to 3 is an input to commit or to resolution (premise 1), so nothing in the mechanism holds them. By premise 2 the listing of designs and profiles is kept by no party and qualifies no one. Is a public listing not a stored list of members by another name? It says what a wallet declared, never what the wallet is, and no party decides who enters it. Does a dominant reader, an index most others consult, become a roster in all but name? Its reading gates nothing and binds no one, and a second reader computes its own from the same data. The equilibrium needs none of the readings either (premise 3): a seller&rsquo;s comparison is over its payment, its bond and what it holds, whatever a reader calls its role.
                </PaperRun>
                <PaperRun title="Step 5: the readings are open-world.">
                    By premise 1 commit consults no listing, so a seller absent from every listing can trade now, by a direct counter-signature. Its absence from the listing is therefore unknown rather than false: nothing in the data says it cannot trade for the resource. By premise 2, likewise, a clause no reader has seen may already be published. A reading that treats the present set of roles, markets or communities as complete treats as false what is only unknown. The readings hold under premise 5 and fail under Reiter&rsquo;s closed-world assumption.
                </PaperRun>
                <PaperRun title="Conclusion.">
                    By Steps 1 to 5, who a party is to a trade, which market it stands in, which community it belongs to and which law the parties chose are derivations. Their sources are the composed clauses, the signed topology, holdings and attestations. No stored copy of them is an input to commit or to resolution or gates a trade, and they are read under the open-world assumption.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The proposition is false if a form of trade is shown that cannot be composed from clauses, topology, holdings and attestations without a list kept by a party standing over the trade. The strongest candidate is admission by a judgment of the person rather than the holding: a guild that admits a member for character, not for a token. That judgment lands in one of three places. A seller may decline to counter-sign, which is its own judgment at acceptance and no list. A body that judges persons may issue a token to those it admits, and a designer may compose an assembly in that token. The judgment then enters the graph as a holding. It is made off the graph, by a party over its own token and over no trade. A disagreement about whether a term was met goes to a forum, which rules on the open data and never calls resolution. A form that needs a party able to stop other parties&rsquo; trades with each other is the form that would refute the proposition, because it needs the seat the mechanism lacks.
                </PaperRun>
                <PaperRun title="Scope.">
                    The proposition concerns readings. What the mechanism enforces is fixed: the commitments, the bonds, the resolution, the signers and the proof of a term against the agreement&rsquo;s fingerprint. The truth of a declaration or an attestation is the signer&rsquo;s, and the chain checks the signer, not the fact. The equilibrium enters only through premise 3, with its conditions and its reach condition, and nothing is claimed for parties within each other&rsquo;s coercive reach.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Door Is a Holding">
                <p>
                    No venue holds the state of a market between asking and binding (Figaro 2026d). What this paper adds to market formation is where the door to a market is read.
                </p>
                <p>
                    A designer can make its own token the door to a resource. Its assembly prices every payment and bond in that token, and the sellers who bind the assembly accept it (Figaro 2026c). The chain checks no holding beyond the bond it locks. A buyer reaches the resource by holding the token, because it must lock <Math>{"2P"}</Math> of it at commit. A seller at an order of cumulative value <Math>{"G"}</Math> must hold <Math>{"2G"}</Math> of it. The door is therefore read from balances on both sides, and no party admits anyone through it beyond what the token&rsquo;s own issuer can do to balances, a power every signer accepted with the denomination.
                </p>
                <p>
                    Can the issuer of a denomination not stop other parties&rsquo; trades, by freezing or blocklisting balances? Such a token may denominate a process, and the issuer&rsquo;s power over it is then a term every signer accepted when it signed the token into the agreement. A party that will not bear that power selects a denomination whose issuer holds none, and the choice is read from the agreement like every other term. Does a designer whose token gates an assembly not stand over the trade? It sets no price; each price is the parties&rsquo;. It holds no position in a process it is not a party to, and its interest in the market is the token, worth what access to the resource is worth. Where that token carries a power to freeze or blocklist balances, the designer is the issuer of the previous answer: its power is the term every signer accepted with the denomination, and no seat in the process.
                </p>
            </PaperSection>

            <PaperSection title="5. The Graph Meets the Law Through Its Clauses">
                <p>
                    A clause may name applicable law, a forum, a filing a jurisdiction requires or a license. A trade can thus meet its regulatory, legal and fiscal obligations through the terms the parties signed and the data the process leaves (Figaro 2026c). This paper keeps only the boundary that Proposition 1 implies. The mechanism sees fingerprints and figures. The meaning of a clause, including which law it names, is the parties&rsquo; and their readers&rsquo;.
                </p>
                <p>
                    A regulator, a tax authority or a court is then one more reader. It derives what it needs from the data a process leaves, shown to it by a party with an inclusion proof against the fingerprint. Law reaches the parties off-chain on its own terms, and reaches the process only through them.
                </p>
            </PaperSection>

            <PaperSection title="6. What the Reading Costs and What It Buys">
                <p>
                    A derived role has a price. When two readers apply different derivations to the same data, one may read <Math>{"W"}</Math> as a courier and the other as a seller of carrying. Neither holds a privileged seat, and no party can fix the reading for both. Is that not disorder where a roster gave an answer? What binds is the signed agreement, and it is fixed. A reader that needs a label computes it and owns it, and the cost of reading published terms falls on the reader.
                </p>
                <p>
                    What the price buys is the absence of a gate. A new form of trade needs no party&rsquo;s leave, since a designer publishes it and sellers bind it. No party earns a rent from holding the list, since no list a party holds gates a trade. Every reading can be checked against the fingerprints by anyone the parties show the data to. Hayek (1945) argued that the knowledge an economy runs on is dispersed among the people who hold it and never given whole to one mind. The graph is perhaps the case in which the list of who is what is dispersed the same way.
                </p>
                <PaperRemark title="Granovetter&rsquo;s embeddedness, read here.">
                    The graph makes some social relations explicit as signed clauses. Trust, kinship and reputation outside the graph stay embedded where Granovetter (1985) found them, and enter the graph only through a party&rsquo;s own choice of whom it selects or accepts. The bond makes a stranger&rsquo;s promise good where no such relation exists, and leaves the relations that do exist where they are.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    A mechanism that fixes two bonds and the buyer&rsquo;s resolution leaves no seat for a party that keeps the list of who trades, as what, under which law. The form of a trade does not need one. A role is a position in the composed clauses and the signed topology. The published market is computed from bindings and balances, and a community from bindings, selections and balances. The law chosen is the value of a signed clause. Each is a derivation that any reader may compute and none may impose, read under the open-world assumption. The cost is that no reading is authoritative above the signed agreement. What that cost buys is a graph any wallet extends by publishing.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
