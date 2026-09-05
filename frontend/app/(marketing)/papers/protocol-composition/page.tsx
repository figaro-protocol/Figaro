import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Protocol Composition: A Decision Rule, Clause Design, and the Coordinator Pattern — Figaro Protocol",
    description:
        "The kernel becomes a protocol when work is composed onto it without weakening its equilibrium: a checkable decision rule for what belongs in the protocol, clause design as a verification discipline, and the coordinator pattern's sufficient conditions for invariant-preserving composition (the equilibrium step rests on the bonding derivation's payoff argument).",
});

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

const CATALOGUE: [string, string][] = [
    ["Commerce", "settlement currency, payment amount, and line items — the commercial half of every order"],
    ["Topology", "the ordering of sellers the parties commit to; agreement-only, with no runtime attestation"],
    ["Assembly provenance", "the registered composition this agreement instantiates, carried as that composition's own hash"],
    ["Utility token", "the single token an assembly's processes are denominated in, pinned once by the designer and folded into every agreement"],
    ["Geolocation", "origin and destination under a declared geocode standard"],
    ["Modalities", "the buyer's requested modality: consume-onsite, pickup, delivery, or virtual"],
    ["Schedule", "the agreed time window as one half-open interval; a duration is derived from it rather than stored beside it"],
    ["Handoff", "the point where a physical exchange occurs"],
    ["Proximity policy", "accepted detection bands committed at signing; the hand-off proof filed as a runtime witness stage on the same clause"],
    ["Content hand-off", "the digital counterpart of the hand-off clause; the delivered artifact's content hash filed as the completion witness stage"],
    ["Cargo", "logistic-unit shipment measure: mass, volume, packaged dimensions, packaging"],
    ["Dimensional weight", "the billed weight of a parcel and the divisor applied, so a reader reproduces the computation from the same order's cargo section"],
    ["Cold chain", "temperature-controlled handling class committed at signing; the period record filed as a runtime witness stage"],
    ["Freight class", "the declared road-freight classification and item number, referenced against the published classification standard"],
    ["Dangerous goods", "the UN number, proper shipping name, hazard class, and packing group for regulated dangerous goods"],
    ["Incoterms 2020", "the declared trade-delivery rule and the named place or port it requires, referenced against the ICC's published edition"],
    ["Chain of custody", "the integrity regime committed at signing; custody events — applied, inspected intact, transferred, breached, removed — filed as runtime witness stages"],
    ["Acceptance criteria", "the basis on which goods or work are accepted, committed at signing; inspection and receipt outcomes filed as a runtime witness stage"],
    ["Merchant process", "merchant per-role event ladder"],
    ["Courier process", "courier per-role event ladder"],
    ["Emissions", "accounting methodology committed at signing; measured grams CO₂e filed as a runtime witness stage on the same clause"],
    ["Credential", "a licence, certification, or permit the seller declares, anchored to an external authority's own public register"],
    ["Data license", "the terms of a sale whose value added is access to records: scope, purpose, snapshot or stream access, and redistribution"],
    ["Data terms", "the disclosure regime for the process's own records, with the buyer committing a choice over its own half"],
    ["Consent", "cryptographic acceptance of one or more off-chain documents, each identified by content hash"],
    ["Arbitration (Kleros)", "off-chain arbitration-forum selection: the subcourt and the minimum juror count"],
    ["Applicable law", "governing law and, optionally, the named venue and proceedings language"],
];

export default function ProtocolExtensionPaper() {
    return (
        <PaperLayout slug="protocol-composition"
            title="Protocol Composition: A Decision Rule, Clause Design, and the Coordinator Pattern"
            subtitle="Composing Onto a Frozen Kernel Without Weakening Its Equilibrium"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        The Figaro kernel is a settlement primitive: a dual-signed commitment and a buyer-only atomic resolution, with no upgrade path and no escape hatches. Its mechanism-design derivation (asymmetric bonding together with the equilibrium it produces, that equilibrium&rsquo;s extension to <Math>{"N"}</Math>-party chains under buyer dominance with atomic resolution, and the escape-hatch theorem) and its formal verification &mdash; machine checks performed by the authoring project, with no external audit of them completed &mdash; are kernel-tier results. This paper takes those three as given and restates them in substance where they are used.
                    </p>
                    <p>
                        This paper covers what stands above the kernel as a research object. The kernel by itself is not a useful protocol; it becomes one when compositions are layered onto it. Three discipline questions arise. When should a protocol composition be written, and what does it mean for a composition to preserve the kernel&rsquo;s equilibrium properties? The <em>protocol composition doctrine</em> answers with the anchored-reference pattern, append-only identity, first-write-wins binding, and the boundary between per-instance payloads and shared reference semantics. How should new clauses be designed and verified? We treat <em>clause design as a computer-science discipline</em>: a canonical specification, content-addressed registration, and the merkle-binding under which a registered clause becomes immediately attestable without any per-clause on-chain code. How does the <em>coordinator pattern</em> keep the bonding equilibrium intact when an external mechanism is composed onto the kernel? We define composition semantics, state sufficient conditions under which the kernel&rsquo;s invariants survive composition and its equilibrium argument is inherited rather than re-derived, and discharge those conditions on two worked composers &mdash; an attestation coordinator and a swap-funded commitment coordinator. We close by running both rules over three concrete compositions &mdash; an arbitration ruling consumed as resolution input, a wallet-side swap as denomination on-ramp, and post-settlement payout routing &mdash; where the instructive results are the two the rules license by keeping out of the protocol.
                    </p>
                    <p>
                        The paper is in computer-science register: software architecture as a research object, with the discipline derived from the kernel&rsquo;s security requirements rather than from convenience.
                    </p>
                </>
            }
            references={
                <>
                    <li>Abadi, M. &amp; Lamport, L. Composing specifications. <em>ACM Transactions on Programming Languages and Systems</em>, 15(1):73&ndash;132, 1993.</li>
                    <li>Bloemen, R., Logvinov, L., &amp; Evans, J. EIP-712: Typed Structured Data Hashing and Signing. Ethereum Improvement Proposal 712, September 2017.</li>
                    <li>de Alfaro, L. &amp; Henzinger, T. A. Interface automata. In <em>Proc. ESEC/FSE</em>, ACM SIGSOFT Software Engineering Notes 26(5):109&ndash;120, 2001.</li>
                    <li>Jones, C. B. Tentative steps toward a development method for interfering programs. <em>ACM Transactions on Programming Languages and Systems</em>, 5(4):596&ndash;619, 1983.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The Figaro kernel is a settlement primitive whose frozen invariants produce a Nash equilibrium &mdash; subgame-perfect at the bilateral edge, where the buyer&rsquo;s post-performance preference for resolving is what makes it credible &mdash; under asymmetric bonding rules and buyer dominance with atomic resolution. As written, the kernel satisfies those invariants under machine checking, and the composition results below inherit exactly the weight that carries: the checks are the authoring project&rsquo;s own, no external audit of them has been performed, the model-checked configurations are bounded, and the equilibrium argument is checked apart from the code at arbitrary chain length. The kernel itself stops at its boundary because that is where the formal results live.
                </p>
                <p>
                    The kernel by itself is not a useful protocol. A settlement primitive needs a graph above it that participants can compose: clauses typing the agreement content, mechanism contracts coordinating specific patterns, runtime surfaces letting humans and agents interact with the resulting institutional shapes. The graph is what makes the kernel applied; the kernel is what makes the graph trustworthy. The discipline that governs the graph &mdash; how protocol compositions are written and how runtime compositions are organized &mdash; is the subject of the present paper.
                </p>
                <p>The argument is in three parts.</p>
                <PaperRun title="The protocol composition doctrine.">
                    Compositions must preserve the kernel&rsquo;s equilibrium properties or they break the protocol; we state a checkable decision rule for whether a new domain feature belongs in the protocol, and develop the anchored-reference pattern as its recurring structural shape.
                </PaperRun>
                <PaperRun title="Clause design as a computer-science discipline.">
                    A Figaro clause is a typed-data definition under append-only identity discipline, registered permissionlessly first-write-wins, content-addressed to its canonical specification, and made attestable by merkle-binding against the signed agreement.
                </PaperRun>
                <PaperRun title="The coordinator pattern formally.">
                    An external mechanism composes with the kernel without breaking the bonding equilibrium when it satisfies specified conditions on its read/write profile against kernel state; we state the conditions with composition semantics and show they suffice to preserve the kernel&rsquo;s invariants and the payoff structure the equilibrium argument runs on, then discharge them on two composers &mdash; one that touches no kernel operation and one that forwards a signed commitment.
                </PaperRun>
                <p>
                    Section 6 then puts both rules to work on three concrete compositions &mdash; an arbitration forum&rsquo;s ruling consumed as resolution input, a wallet-side swap as denomination on-ramp, and post-settlement payout routing &mdash; two of which the rules license by keeping them out of the protocol.
                </p>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>The bonded primitive&rsquo;s mechanism-design derivation is out of scope for the present paper. Three of its results carry the weight of Sections 5 and 6 &mdash; the equilibrium asymmetric bonding produces, that equilibrium&rsquo;s extension to <Math>{"N"}</Math>-party chains under buyer dominance with atomic resolution, and the escape-hatch theorem &mdash; and each is restated here in substance, so that this paper stands on its own and can say which of its claims rest on which.</p>
                <PaperRun title="Kernel surface.">
                    Two state-changing operations, each carrying a mechanism design of its own. <em>Commit</em> forms a bilateral edge under <em>asymmetric bonding</em>: both parties sign a typed-data commitment (Bloemen, Logvinov, &amp; Evans, 2017), the buyer locks twice the payment <Math>{"P"}</Math>, and the seller locks twice the value <Math>{"G"}</Math> the process has accumulated through its own link. That figure is <em>inclusive</em> &mdash; <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math>, the order&rsquo;s own payment counted &mdash; and it is fixed by arithmetic against the signed accumulator rather than reported by anyone: a commitment declaring any other value is refused. <em>Resolution</em> settles the process under <em>buyer dominance with atomic resolution</em>: only the buyer may call it, every active order settles together or none does, and it is terminal. Three pieces of stored state: per-process state (the root buyer, denomination, accumulated value, and active-order count), per-order status, and the order-to-process mapping.
                </PaperRun>
                <PaperRun title="The bonding equilibrium.">
                    After performance, resolving is unconditionally strictly better for the buyer &mdash; a comparison that requires no assumption whatever about the seller, since the buyer holds the value either way and only the mechanism&rsquo;s transfers differ. Given that, performance is each seller&rsquo;s strict best response. The two calls compose in that order and neither result stands alone. Both comparisons are made at the node where the choice falls rather than over plans fixed in advance, so at the bilateral edge the cooperative profile is subgame-perfect and not merely Nash: a buyer plan that threatens never to resolve is struck out by the first comparison, which holds after any performance whatever preceded it. The deterrent has content only because value passes off the record: a party that defects keeps what is in its hands, so every deterrence claim is a retention computation &mdash; the locked bond set against the value the defector retains, at the measure the parties themselves signed &mdash; and never a statement about locked bonds alone.
                </PaperRun>
                <PaperRun title="The N-party extension.">
                    Because each seller&rsquo;s bond is tied to the accumulated figure at its own link rather than to its local payment, the same comparison holds at every position of a process chain, and each seller&rsquo;s exposure rises with every payment the chain has already accumulated ahead of it. Atomic resolution then operates on that mesh of separately bonded edges, which by itself has no way to close: it replaces the unattainable mutual agreement of an <Math>{"N"}</Math>-party trade with a single signature. That every payout waits on the same resolution is the mechanism&rsquo;s own doing; that it waits on every seller&rsquo;s performance is the rational buyer&rsquo;s plan &mdash; resolving only against universal performance &mdash; and under that plan the sellers are in a weakest-link subgame, each one&rsquo;s payout waiting on every other&rsquo;s performance.
                </PaperRun>
                <PaperRun title="The escape-hatch theorem.">
                    Call any operation that would release part of a bonded position without a buyer resolution an <em>exit path</em>. Augmenting the bonded game with one puts the release of the bonds either on the decision of a party outside the bonded pair &mdash; an agent that deposits nothing into the process and holds nothing of what the process moves, whose ranking of the alternatives the mechanism has nothing to fix &mdash; or on the decision of a bonded party, in which case a third continuation stands at a node whose two the equilibrium argument weighed against each other, and the established results do not transfer to the augmented mechanism by inheritance. This is what &ldquo;no escape hatches&rdquo; secures, and it is why the kernel has exactly two operations.
                </PaperRun>
                <PaperRun title="Where disputes sit.">
                    Nothing above leaves a disappointed party without recourse; it locates the recourse. Remedies are negotiated between the parties while the process stands open &mdash; concretely, a seller that cannot perform sends the buyer the payment it stands to receive, so that at resolution it nets bond-only and the buyer is whole &mdash; and the buyer resolves once satisfied. An outside forum may rule on the open process record, and the reason its ruling is not an exit path is that it cannot resolve: resolution is the buyer&rsquo;s alone, and no forum has direct enforcement over a balance the kernel holds. Resolution is terminal acceptance, with no recourse after it.
                </PaperRun>
                <PaperRun title="Six invariants.">
                    (i) asymmetric bonding (buyer locks <Math>{"2P"}</Math>, seller locks <Math>{"2G"}</Math>); (ii) bonding against the accumulated value at each link across <Math>{"N"}</Math>-party process chains; (iii) buyer dominance (only the root buyer can resolve); (iv) atomic resolution (all active orders settle simultaneously or not at all); (v) immutable evidence (commits and resolutions emit unmodifiable events); (vi) no escape hatches (no admin, no timeout, no governance, no unilateral exit).
                </PaperRun>
                <PaperRun title="Three tiers.">
                    <em>Kernel</em>: the irreducible settlement primitive. <em>Protocol</em>: the kernel together with the compositions layered onto it under the discipline of this paper. <em>Runtime</em>: the protocol together with semantic layers, builder surfaces, and rendered institutional shapes that humans and agents interact with.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Protocol Composition Doctrine">
                <p>
                    The kernel is intentionally narrow: its narrowness is what produces the bonding equilibrium, and widening it would weaken the equilibrium. Compositions must therefore add capability without widening the kernel itself; the doctrine answers how.
                </p>
                <PaperSubsection title="3.1 What the kernel secures">
                    <p>
                        At the kernel layer the protocol secures five things and only these: (i) process membership (which orders belong to which process); (ii) economic obligations between counterparties (the bond posture at each order); (iii) role-bearing order nodes (who is the buyer and who is the seller at each order); (iv) lifecycle and settlement history (when each order was committed and resolved); (v) atomic process resolution semantics (the all-or-nothing settlement rule).
                    </p>
                    <p>
                        The kernel does not encode domain-specific meaning. A bonded commitment between a passenger and an airline, between a shipper and a forwarder, or between an agent and a service provider all reduce to the same kernel objects (an order with a seller, a buyer, a payment, and an agreement-hash). Domain meaning is added by compositions that attach typed information to the secured process graph.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.2 The anchored-reference pattern">
                    <p>
                        The recurring structural shape of a Figaro composition is the <em>anchored-reference pattern</em>: off-chain semantics (the document, the methodology, the field catalogue, the legal interpretation) plus an on-chain anchor for shared reference integrity. It is the shape a feature takes once it has passed the decision rule of Section 3.4, and the rule&rsquo;s three conditions are its conditions: the definition attaches to the secured process graph rather than to private instance data; multiple parties or tools must share a stable interpretation of it; and that interpretation must remain readable, unchanged, over the life of anything filed against it. The anchor carries only what the chain needs to identify the definition, verify that the off-chain document referenced is the one that was committed, and &mdash; on the settlement path that consults it &mdash; establish that the identity was registered at all. Ordering in time it does not establish and is not asked to: the anchor bears no timestamp, and which of two registrations came first is a derivation an indexer makes from the event log. The anchor does not carry the semantics themselves.
                    </p>
                    <FormalBlock label="Definition 3.1 (Anchor record).">
                        <p>
                            A protocol-layer anchor for a reference family is a tuple <Math>{"\\langle \\text{clauseId}, \\text{version}, \\text{contentHash}, \\text{registered}, \\text{deposit} \\rangle"}</Math>: clauseId the anchor identity, version the version within the family, contentHash an immutable cryptographic hash of the canonical off-chain specification, registered the binding&rsquo;s monotone flag (false until first registration, true thereafter; the discipline forbids deactivation), and deposit the staked-intent state &mdash; who staked, and whether the stake has since been reclaimed. Three of the five are queryable state on the anchor itself: the flag; the content hash, because a settling verifier must be able to check a specification supplied to it against the one the family committed to; and the deposit state, because whether anyone still stands behind an entry is a fact readers act on. Version and the content&rsquo;s location live on the registration event log, and the conceptual anchor is reconstructed by reading that log under the append-only-identity discipline of Section 4.2.
                        </p>
                    </FormalBlock>
                    <p>
                        The minimal-anchor surface is intentional: larger anchors would freeze interpretive commitments into brittle on-chain state; smaller anchors would lose reference integrity. This is the narrowest shape that supports cross-party agreement on which definition is referenced, at which version, against which document, and whether anyone still stands behind it.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.3 Per-instance payloads versus shared reference semantics">
                    <p>
                        The discipline turns on a load-bearing distinction between <em>per-instance payloads</em> and <em>shared reference semantics</em>. Per-instance payloads are operational data values: specific delivery details, sealed address data, notes for a particular delivery event. These are typically private, mutable at the business level, or specific to one workflow instance; they do not deserve a protocol-level anchor and live as instance data on the order or process that carries them. Shared reference semantics are definitions whose interpretation must remain stable across counterparties, tools, or time: a disclosure clause, a bill-of-lading clause family, a certification framework reference, a quality-assurance reference standard. These may justify a protocol-level anchor under the anchored-reference pattern.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.4 The decision rule">
                    <FormalBlock label="Proposition 3.2 (Decision rule for protocol composition).">
                        <p>A new domain feature belongs in the protocol if and only if all three of the following hold: (1) the feature attaches meaning to the secured process graph rather than to private instance data; (2) the feature requires stable shared interpretation across counterparties or tools; (3) the protocol needs to preserve that reference integrity over time. A feature satisfying all three conditions is a candidate for the anchored-reference pattern. A feature failing any of the three belongs in app logic, off-chain infrastructure, or per-instance payload handling.</p>
                    </FormalBlock>
                    <p>
                        The proposition is operationally checkable: each condition has a yes/no answer for a given proposed feature, and a feature that fails the check is not a protocol-composition candidate. The rule is binding: the discipline is the willingness to keep features out of the protocol when the rule fails them, not just to add them when it passes them.
                    </p>
                    <p>Four guardrails operationalize the rule:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        <li>Do not push app-specific workflow logic into the kernel. App logic that belongs to one institution does not belong to the protocol, regardless of how compelling the institution is.</li>
                        <li>Do not make the protocol so abstract that every document becomes a first-class ontology object. Bounded generality is the target; universal-ontology generality is a failure mode.</li>
                        <li>Do preserve reusable patterns when multiple domains clearly need the same coordination primitive. Generality earned by multiple domain instances is the kind of generality the protocol should accommodate.</li>
                        <li>Keep the protocol legible: process graph first, composition semantics second, app UX last. The order of legibility reflects the order of trust dependency.</li>
                    </ol>
                    <p>
                        The guardrails do not add a fourth condition to Proposition 3.2; they govern how a candidate that passes it should be <em>specified</em>. Their central tension is between under- and over-generality: under-generality fragments the protocol into one-off app-specific modules and incompatible bilateral arrangements; over-generality produces a fake universal ontology and protocol bloat that mistakes possibility for scope. The working diagnostic is whether the primitive can be specified narrowly enough to serve more than one domain without becoming a universal-ontology object &mdash; a question about the shape of an admitted composition, not about whether to admit it.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Clause Design as a CS Discipline">
                <p>
                    A Figaro clause is the concrete realization of an anchored-reference family. Designing a clause is the operational form of applying the composition doctrine. We treat the discipline in computer-science register: typed-data design, content-addressed composition, verification-stack architecture.
                </p>
                <PaperSubsection title="4.1 The clause specification and its enforcement layers">
                    <p>A protocol-tier clause is realized across coordinated layers that together discharge the clause&rsquo;s correctness. The canonical specification is authoritative and every other layer is derived from it; no layer is a per-clause on-chain validator, and the two settlement paths gate differently. On the direct path the on-chain gate is merkle inclusion under the signed agreement root: the chain establishes that the clause was in the agreement both parties signed, and checks no content shape. On the proof-batched path a generic engine checks content shape against the registered specification before settlement. Both paths are stated precisely below, and the difference matters at every point where this paper says what the chain does and does not know.</p>
                    <PaperRun title="Canonical specification.">
                        A canonical specification of the clause, parsed by a meta-validator over a closed subset of structured-data types (strings with specified formats, integers, arbitrary-precision integers as decimal strings, booleans, enums, arrays, and objects, with strict rejection of unknown fields). Per-stage overrides express the staged-attestation pattern: the specification&rsquo;s base fields are what the parties commit at signing, and a numbered stage declares the different shape a runtime witness against the same clause carries &mdash; a cold-chain clause committing a handling class, a temperature band, and a recording interval, with its first stage carrying a period&rsquo;s observed minimum and maximum instead. One further field, an article, places the clause within the body of terms; that is the whole of the specification&rsquo;s discoverability surface, and how a reader groups clauses for presentation is the reader&rsquo;s concern rather than the specification&rsquo;s.
                    </PaperRun>
                    <PaperRun title="Off-chain well-formedness validator.">
                        A client-side implementation of the specification&rsquo;s well-formedness check, run at both bilateral signing points (so neither party signs content the specification would reject) and at read time (so a consumer can re-check an attestation against the clause it was filed under). It decodes the clause&rsquo;s canonical content encoding and rejects on any violation. On the direct path this check has no on-chain counterpart: no per-clause validator code exists on chain, and none is ever written.
                    </PaperRun>
                    <PaperRun title="Prover mirror.">
                        The same well-formedness check runs inside a zero-knowledge prover on the proof-batched settlement path, producing verifiable attestation receipts during off-chain execution. This is where content shape acquires an on-chain consequence, and it acquires it without any per-clause code: the prover holds a <em>generic</em> validation engine and no clause, each clause&rsquo;s canonical specification arriving as a witness input whose hash the settling verifier matches against the anchored content hash of Definition 3.1. A batch settles only on a match, so registering a clause never touches the prover, its verification key, or the verifier. The canonical specification and its off-chain validator are that engine&rsquo;s conformance specification.
                    </PaperRun>
                    <PaperRun title="On-chain merkle binding.">
                        On the direct path the attestation coordinator binds each attestation to the order&rsquo;s signed agreement by verifying a merkle-inclusion proof of the clause section against the agreement hash. It validates no clause content shape and invokes no per-clause validator, and it does not hash the content either. The caller supplies two values: the section&rsquo;s hash, which the coordinator checks by inclusion against the agreement hash, and a fingerprint of the off-chain content, which it emits verbatim and checks against nothing. Neither preimage reaches calldata, which is what keeps a sealed section sealed; what the chain establishes is the section&rsquo;s membership in the signed agreement, and truth-of-content is left to the off-chain layers.
                    </PaperRun>
                    <PaperRun title="Runtime-tier binding and the lockstep contract.">
                        A frontend integration consumes the canonical specification — shaping clause-typed forms from the spec and validating the assembled agreement&rsquo;s content against it before either party signs — then carries the encoded content to chain; an unintegrated clause exists on chain and not in any product. A new clause is not done until the canonical specification, its off-chain validator, and its runtime binding ship in lockstep: if the specification says one thing and a derived layer enforces another, attestations silently divide into two interpretations and the clause&rsquo;s reference integrity collapses. The lockstep contract is operational discipline rather than a formal soundness theorem, enforced by deriving every layer from the single canonical specification and by a test suite covering well-formed input plus every rejection path.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.2 Append-only identity">
                    <p>Clause identity is append-only. The discipline produces three operational rules:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        <li>No in-place rewriting of clause meaning. A registered clause cannot be modified through any contract operation; the clause record at clauseId is immutable from the moment of registration.</li>
                        <li>No silent mutation of the content reference behind an existing identity. The content-hash field of the anchor is immutable; the specification document may be mirrored at as many locations as availability requires, but the canonical reference is the hash, never any one of those locations.</li>
                        <li>New meaning requires a new version or a new clause identity. A clause family that needs a substantive change registers a new clauseId at the next version; it never mutates the existing version&rsquo;s anchor or its canonical specification.</li>
                    </ol>
                    <p>The append-only rule preserves historical interpretability: attestations remain readable against the exact clause anchor they were filed under, regardless of subsequent clause-family evolution.</p>
                </PaperSubsection>
                <PaperSubsection title="4.3 First-write-wins registration">
                    <p>
                        Clause registration is permissionless and first-write-wins. Any address may register a clauseId under a live deposit &mdash; an exact amount of the network&rsquo;s native currency, fixed when the registry is deployed, returned in full to the registrar on withdrawal and collectable by nobody, there being no operation that sweeps it. The registration binds that clauseId&rsquo;s anchor permanently, and a subsequent attempt to register the same clauseId is rejected. The discipline is deliberate: an admin-mediated registry would re-introduce governance authority over the clause surface; a permissionless registry without first-write-wins would let any address overwrite an existing anchor and break in-flight attestations. The combination is the only design that satisfies both no-admin and no-overwrite.
                    </p>
                    <p>
                        The deposit is what makes permissionlessness survive contact with volume, and it does so without charging anyone. A registrar that means an entry to be composed against leaves the stake in place and loses nothing by it; an address registering entries at scale ties up its own capital once per entry, for as long as each is meant to be usable. Withdrawal is the exit, and it is a <em>de-surfacing</em> rather than a deletion: the stake returns, readers stop offering the entry for new compositions, and the binding itself stays exactly where it was &mdash; agreements already signed against that clauseId keep resolving against it, as append-only identity requires. Nothing is revoked, because nothing can be; what changes is only whether anyone is still standing behind the entry, which is a fact the anchor carries and a reader may consult.
                    </p>
                    <PaperRemark title="Why first-write-wins is structurally necessary.">
                        Consider the alternatives. <em>Admin-mediated registration</em> re-introduces the discretionary actor the no-escape-hatches discipline rules out. <em>Mutable anchors</em> let any address rewrite an anchor, breaking existing attestations under that clauseId. <em>Time-locked anchors</em> buffer the overwrite, but any non-zero delay creates a window in which the anchor is uncertain. First-write-wins produces an anchor that is both permissionless and stable: anyone can register it once; no one can change it after.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="4.4 Immediate attestability">
                    <p>
                        Because no per-clause code is ever deployed on either settlement path, there is no second binding step to race and no front-running window between a clause&rsquo;s appearance and its use. On the direct path a clause is attestable the moment it is a leaf of a signed agreement, registered or not: the coordinator checks inclusion in the signed agreement hash and consults no registry. Registration is what the other two consumers key on &mdash; the batched path resolves a clause only against its registered specification, and the reward&rsquo;s count is keyed by its registered identity. This is the open-world property stated operationally: a never-before-seen clause is attestable against any order whose signed agreement included it, and, once registered, settleable in a batch against its own specification, with zero per-clause on-chain code in either case. On the direct path the whole of the on-chain <em>content</em> gate is the merkle-inclusion proof that the clause was part of the bilateral agreement, and content shape is a specification-plus-read-time concern; on the batched path the generic engine adds the shape check without adding anything clause-specific to the chain. What the chain checks besides concerns who may file and when, never what is filed &mdash; and none of it is clause-specific either, so no clause waits on anyone&rsquo;s permission to exist.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.5 The reference clause catalogue">
                    <p>The protocol currently ships a coordinated set of reference clauses, treated as a reference set rather than as independent compositions. The set is open and grows by registration, so no enumeration of it is a definition of it; it stands at this writing as:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        {CATALOGUE.map(([id, desc]) => (
                            <li key={id}><em>{id}</em> &mdash; {desc}</li>
                        ))}
                    </ol>
                    <p>
                        The catalogue exhibits several reusable patterns. The <em>sister-clause pattern</em> (the merchant and courier process clauses; a provider-specific arbitration clause beside the sibling a second forum would require) supplies multiple specialized variants of a shared coordination concept: content shape is shared, clauseId is per-variant, and a new sibling can be registered without affecting the others. The <em>witness-stage pattern</em> keeps a committed policy and its runtime proof on a single clause rather than splitting one concept across two: a clause commits its policy at agreement signing (fixed for the order&rsquo;s life), and any runtime proof of that policy is filed during execution as a runtime attestation on that same clause, its content shape declared as a witness stage in the specification. Emissions commits an accounting methodology and carries measured grams CO&#8322;e as its witness stage; proximity policy commits the accepted detection bands and carries the detected-band hand-off proof as its witness stage; cold chain commits a handling class and carries the period record the same way. Every clause section — committed policy or runtime witness — is a merkle leaf under the same agreement hash: there is no separate &ldquo;cross-checked&rdquo; tier and no separate &ldquo;runtime&rdquo; tier, only a difference in <em>when</em> the content is supplied. The <em>agreement-only clause</em> pattern (the topology clause) is a shared-vocabulary anchor whose enforcement is purely off-chain: parties commit to the ordering at contract-signing time, an indexer reconstructs it from event logs, and no runtime attestation fires.
                    </p>
                    <p>
                        One boundary is worth marking before leaving the discipline, since it governs what the records produced under it are worth. An attestation filed this way is a participant&rsquo;s assertion: the chain establishes that it was filed under a clause the parties signed, and establishes nothing about whether what it says is true. Records of that kind are substantively contestable on truth-of-content grounds &mdash; which is exactly what distinguishes them from the settlement records the kernel emits by construction, where there is no assertion to contest.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.6 What clause design is not">
                    <p>
                        Three classes of would-be composition fall outside the discipline. <em>Per-instance payload clauses</em>: most order-specific data does not need a registered clause; it needs an order-specific encoder and an off-chain decoder. The decision rule (Proposition 3.2) asks whether the shape needs stable shared interpretation across parties or tools &mdash; if not, the data is a payload, not a clause candidate. <em>Clauses with mutable freeform text, or with their substance carried inline rather than by reference</em>: mutable freeform text violates append-only identity, and a clause whose content is meant to sit on chain rather than behind a content hash violates the minimal-anchor surface. <em>Clauses with admin, pause, or upgrade hooks</em>: the no-escape-hatches discipline applies to clauses as it applies to the kernel; an admin-controlled clause surface re-introduces the discretionary actor.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. The Coordinator Pattern">
                <p>
                    We turn now to the second discipline question: under what conditions does an external mechanism contract compose with the kernel without breaking the bonding equilibrium? The discipline that answers this is the <em>coordinator pattern</em>: a set of sufficient conditions on a composition contract&rsquo;s read/write profile against kernel state under which the kernel&rsquo;s invariants survive composition and its bonding equilibrium is inherited rather than re-derived.
                </p>
                <PaperSubsection title="5.1 Composition semantics">
                    <p>
                        Let <Math>{"\\mathcal{K}"}</Math> denote the Figaro kernel as a state machine with state space <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math> (the values of the kernel&rsquo;s stored mappings) and transition function <Math>{"\\delta_{\\mathcal{K}}"}</Math> restricted to commit and resolution. Let <Math>{"\\mathcal{M}"}</Math> denote an external mechanism contract with state space <Math>{"\\mathcal{S}_{\\mathcal{M}}"}</Math> and transition function <Math>{"\\delta_{\\mathcal{M}}"}</Math>.
                    </p>
                    <FormalBlock label="Definition 5.1 (Composition).">
                        <p>
                            We extend the state space to include the kernel contract&rsquo;s ERC-20 token-balance position <Math>{"\\beta_{\\mathcal{K}}"}</Math> and the event log <Math>{"E_{\\mathcal{K}}"}</Math> alongside <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math> proper. The composition <Math>{"\\mathcal{K} \\otimes \\mathcal{M}"}</Math> is the joint state machine over that extended space, in which <Math>{"\\mathcal{M}"}</Math> may read <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, <Math>{"\\beta_{\\mathcal{K}}"}</Math>, and <Math>{"E_{\\mathcal{K}}"}</Math>, and <Math>{"\\mathcal{K}"}</Math> neither reads from nor writes to <Math>{"\\mathcal{S}_{\\mathcal{M}}"}</Math> &mdash; the kernel is composition-blind, and needs to be, having been frozen before any <Math>{"\\mathcal{M}"}</Math> existed. Transitions interleave via the EVM call graph: an <Math>{"\\mathcal{M}"}</Math> transition&rsquo;s call frame may invoke <Math>{"\\mathcal{K}"}</Math>&rsquo;s public methods, and where such a call carries the parties&rsquo; own signatures the resulting write belongs to <Math>{"\\delta_{\\mathcal{K}}"}</Math> rather than to <Math>{"\\delta_{\\mathcal{M}}"}</Math> &mdash; the kernel is the writer and applies its own preconditions. The resolution transition is not reachable this way under any signature: it authorizes on the calling address itself, so it is a <Math>{"\\delta_{\\mathcal{K}}"}</Math> step available to the root buyer alone.
                        </p>
                        <p>
                            The definition places no restriction on what <Math>{"\\mathcal{M}"}</Math> does with kernel state beyond what the kernel&rsquo;s own access control already imposes: an arbitrary composed mechanism is admitted here, including one that acquires the ability to write kernel state by holding a party&rsquo;s role or by some other route. Constraining that is the work of Proposition 5.2, and condition (i) is what separates a coordinator from a mechanism that merely happens to sit beside the kernel.
                        </p>
                    </FormalBlock>
                    <p>
                        The extended state space matches the operational semantics of EVM contracts: the bonds a seller posts against the accumulated value at its link sit in <Math>{"\\beta_{\\mathcal{K}}"}</Math> (the kernel&rsquo;s bonded balance) rather than in <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, and the immutable-evidence invariant is over <Math>{"E_{\\mathcal{K}}"}</Math> rather than purely over state mappings. A predicate stated over <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math> alone would leave both outside the preservation claim, which is the reason for the extension.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.2 The coordinator pattern, formally">
                    <FormalBlock label="Proposition 5.2 (Invariant preservation under composition).">
                        <p>If <Math>{"\\mathcal{M}"}</Math> satisfies all five of the following conditions, then every predicate on <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, <Math>{"\\beta_{\\mathcal{K}}"}</Math>, and <Math>{"E_{\\mathcal{K}}"}</Math> that is invariant under <Math>{"\\delta_{\\mathcal{K}}"}</Math> remains invariant under <Math>{"\\delta_{\\mathcal{K} \\otimes \\mathcal{M}}"}</Math>, and the composition introduces no path &mdash; on-chain or off &mdash; by which value reaches a party as a function of how the kernel resolves, other than the kernel&rsquo;s own resolution itself. The conditions:</p>
                        <ul className="space-y-1 list-none pl-0 text-sm">
                            <li>(i) <em>No unauthorized kernel-state mutation.</em> <Math>{"\\mathcal{M}"}</Math> reads kernel state freely &mdash; <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, <Math>{"\\beta_{\\mathcal{K}}"}</Math>, <Math>{"E_{\\mathcal{K}}"}</Math> &mdash; and writes none of it on its own account. The two entry points admit composition asymmetrically, and the asymmetry is the kernel&rsquo;s, not a design choice of the pattern. <em>Commitment</em> admits a relay: the call frame on which <Math>{"\\mathcal{M}.f"}</Math> executes may invoke it while carrying both parties&rsquo; signatures, which the kernel recovers itself before pulling each bond from the named party, so the kernel remains the writer. <em>Resolution</em> admits none: it takes no signature at all and authorizes on the caller&rsquo;s own address &mdash; the caller must <em>be</em> the root buyer &mdash; so no composer can resolve on a buyer&rsquo;s behalf even holding a buyer signature. Nor can <Math>{"\\mathcal{M}"}</Math> hold a party role: the kernel admits only an address whose own ECDSA key produced the signature, so a contract wallet that authenticates by returning a validity answer for a third party&rsquo;s signature cannot be a party.</li>
                            <li>(ii) <em>No alternative settlement path.</em> <Math>{"\\mathcal{M}"}</Math> does not provide an operation that produces value flows equivalent to the kernel&rsquo;s atomic resolution but bypasses it or modifies its preconditions, and holds no discretion over a live process&rsquo;s settlement.</li>
                            <li>(iii) <em>No discretionary lock-bypass.</em> <Math>{"\\mathcal{M}"}</Math> custodies no kernel bonds and does not release bonded funds from <Math>{"\\mathcal{K}"}</Math>&rsquo;s bonded balance under conditions different from those the kernel&rsquo;s resolution enforces.</li>
                            <li>(iv) <em>Agreement-bound content (where applicable).</em> If <Math>{"\\mathcal{M}"}</Math> accepts content typed by a registered clauseId, it admits the content only against an order whose signed agreement included that clause, verified by a merkle-inclusion proof of the clause section against the agreement hash; content for a clause not present in the bilateral agreement is rejected.</li>
                            <li>(v) <em>No off-kernel side-payment.</em> <Math>{"\\mathcal{M}"}</Math> does not commit, on-chain or off-chain, to award value to a party contingent on the kernel&rsquo;s resolved bond outcome. A mechanism reading kernel state under conditions (i)&ndash;(iv) may still promise a payout from collateral it custodies off the kernel, indexed to how the kernel resolves; this condition excludes that.</li>
                        </ul>
                    </FormalBlock>
                    <PaperRun title="Proof sketch.">
                        Each condition preserves a distinct part of the kernel&rsquo;s claims under composition. Condition (i) preserves the kernel state predicates the verification stack establishes (status monotonicity, transition correctness, cumulative integrity): if <Math>{"P : \\mathcal{S}_{\\mathcal{K}} \\to \\mathrm{Bool}"}</Math> is invariant under <Math>{"\\delta_{\\mathcal{K}}"}</Math> and <Math>{"\\delta_{\\mathcal{M}}"}</Math> does not change <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, then <Math>{"P"}</Math> is invariant under <Math>{"\\delta_{\\mathcal{K} \\otimes \\mathcal{M}}"}</Math>, the disjoint union of the two transition functions; a party-signed commitment that <Math>{"\\mathcal{M}"}</Math> merely relays is a <Math>{"\\delta_{\\mathcal{K}}"}</Math> step in that union, not a <Math>{"\\delta_{\\mathcal{M}}"}</Math> one, which is why the condition is stated as <em>authorized</em> writing rather than as no writing at all; resolution needs no such treatment, since the kernel&rsquo;s caller-address check leaves the transition unreachable from <Math>{"\\mathcal{M}"}</Math> altogether. Condition (ii) preserves buyer dominance and atomic resolution by ruling out alternative paths that would bypass them &mdash; an alternative settlement path is exactly the exit path the escape-hatch theorem rules out. Condition (iii) preserves the no-escape-hatches discipline by ruling out lock-bypass. Condition (iv) preserves the agreement-binding surface: a mechanism accepting content under a clauseId not present in the order&rsquo;s signed agreement creates a content surface downstream consumers cannot trust. Condition (v) preserves the on-chain bond ratio as the marginal economic signal: a mechanism that custodies its own off-chain collateral and promises a party a payout indexed to the kernel&rsquo;s resolved state satisfies (i)&ndash;(iv) &mdash; it touches no kernel bonds and bypasses no kernel transition &mdash; yet reintroduces an unbonded actor, the side-payment custodian, into the parties&rsquo; decision calculus, so the bond ratio is no longer the sole marginal signal and the equilibrium argument degrades. The five are jointly sufficient, which is what is claimed for them. Necessity is not: weaker conditions on a sufficiently restricted mechanism &mdash; a pure view contract, say &mdash; suffice for narrower preservation claims, and the value of the list is that it is checkable against an arbitrary candidate rather than minimal against a chosen one.
                    </PaperRun>
                    <PaperRun title="What the proposition establishes, and what it inherits.">
                        The five conditions constrain a mechanism&rsquo;s read/write profile, and the argument above is correspondingly a statement about state and value flow: composing <Math>{"\\mathcal{M}"}</Math> leaves the kernel&rsquo;s invariants standing and opens no second route to the bonded funds or to a payoff indexed on how they settle. It does not, by itself, establish that the parties&rsquo; equilibrium is preserved. That step is carried by the payoff argument restated in Section 2 &mdash; that with the bond posture as the sole marginal signal, resolving is unconditionally strictly better for the buyer once performance has occurred, and given that, performance is each seller&rsquo;s strict best response &mdash; which is a result about rational play over payoffs, is not re-derived here, and is precisely what conditions (ii), (iii), and (v) are chosen to keep intact. Condition (iv) is not doing that work and should not be read as doing it: it preserves the agreement-binding surface, so that content filed against an order is content the parties signed for, which is what downstream consumers of the record rely on rather than what the parties&rsquo; own payoffs turn on. The proposition should therefore be read as: these conditions preserve the payoff structure on which the equilibrium argument runs, so a composition satisfying them inherits that argument rather than requiring a new one. A composition that satisfies all five and nonetheless changes the parties&rsquo; payoffs through a channel this state-and-value model does not represent would fall outside the proposition&rsquo;s reach, and condition (v) is in the list because the off-kernel side-payment was one such channel found by inspection rather than derived from the model.
                    </PaperRun>
                    <PaperRun title="Relation to assume-guarantee reasoning.">
                        Proposition 5.2 has the shape of a proof rule long established in the verification of concurrent systems: a component&rsquo;s guarantee is discharged under an explicit assumption about its environment, so that composing components discharges each other&rsquo;s assumptions instead of re-verifying the whole. Jones (1983) introduced the rely-guarantee discipline for interfering programs, decomposing the proof of a parallel program into per-process obligations against a rely condition describing the interference each process tolerates. Abadi and Lamport (1993) gave the general composition theorem for specifications of that form, together with the soundness conditions under which a conjunction of component specifications implies the specification of the composite. De Alfaro and Henzinger (2001) recast the idea as interface automata, in which an interface states the inputs a component expects as well as the outputs it provides, and compatibility is a check performed at composition time rather than a property of either component alone. The five conditions above are an instance of the non-circular case of Abadi and Lamport&rsquo;s rule and not a departure from it &mdash; the kernel assumes nothing of the composer that the composer must in turn derive from the kernel: conditions (i)&ndash;(v) are the environment assumption a candidate coordinator must satisfy, and the kernel&rsquo;s invariants are the guarantee that survives under it. Composition-time checkability is the property the interface-automata reading contributes, and it is the one this paper actually uses, since a candidate coordinator is checked against the five before it is deployed rather than reasoned about afterwards. What is distinctive here is what the rule is asked to preserve &mdash; not a safety property of a program under concurrent interference, but a <em>payoff-relevant</em> state invariant, the bond posture on which a mechanism-design argument about rational play runs, held under callers assumed adversarial rather than merely concurrent, which is why condition (v) reaches past state and value flow to an off-kernel promise. The contribution claimed is the application, not novelty over that literature.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="5.3 Worked examples: the attestation coordinator and a swap-funded composer">
                    <p>
                        The attestation coordinator is the canonical worked example: it accepts attestations against bonded orders and emits typed events without ever modifying kernel state. Its admission gate has four parts, and only the last of them concerns content. The caller must hold a role on the order &mdash; its seller, its buyer, or an address the seller&rsquo;s own resolution interface answers for. Where a seller attests across orders, both must sit in the same process. The order must be known to the kernel and unresolved, so that the window for evidence closes when the process does. And the clause section must open under a merkle-inclusion proof against the order&rsquo;s signed agreement hash. Content shape it does not check, and the content itself it never sees: the caller supplies a fingerprint, the coordinator emits it verbatim, and nothing on chain compares it to anything.
                    </p>
                    <p>
                        Condition (i) is discharged by parametric kernel-immutability properties over every public function of the coordinator: kernel state before and after execution is unchanged, universally quantified over the coordinator&rsquo;s methods and over state values. The machine-checked surface is the kernel&rsquo;s order-status nullifier and its process record; the order-to-process mapping carries no such rule, and rests instead on the coordinator&rsquo;s holding nothing but a read-only interface to the kernel. Conditions (ii) and (iii) are discharged by construction: the coordinator has no operation that transfers tokens from the kernel&rsquo;s bonded balance and none that invokes any kernel state-changing function. Condition (iv) is discharged by the merkle-inclusion gate. Condition (v) is discharged by construction: the coordinator custodies no collateral and promises no payout, so it makes no side-payment contingent on the kernel&rsquo;s resolution. The five conditions thus reduce to verification requirements a candidate coordinator can be checked against mechanically.
                    </p>
                    <p>
                        A second composer shows the other side of condition (i), where the mechanism does invoke a kernel operation. A swap-funded commitment coordinator lets a party post its bond from a token it does not yet hold in the process denomination: it converts the party&rsquo;s input token and then submits the commitment both parties had already signed. Condition (i) is the interesting one and it is discharged rather than evaded: the write is authorized because the kernel performs its own signature recovery and pulls each bond from the named party, so the composer forwards the parties&rsquo; own commitment and funds the party in place rather than substituting for it, never becoming a counterparty and never writing kernel state before the call it forwards. Condition (ii) holds because the conversion is a funding leg that completes before any bonded state exists, and the composer offers no operation that moves value out of the kernel. Condition (iii) holds because the bond currency and the bond amounts derive from the signed commitment rather than from the caller, so no funding leg can under-fund the kernel&rsquo;s pull, and the composer retains no lever once the commitment is in. Condition (iv) is not engaged, the composer accepting no clause-typed content &mdash; but the binding it does rely on is worth stating exactly, since it takes <em>two</em> signatures and the split is the composer&rsquo;s whole point. The bilateral commitment fixes the bond currency and the amounts and says nothing whatever about how the funding party gets there; the conversion route &mdash; the venue, the input token, the ceiling on input, and a hash of the exact swap calldata &mdash; is bound by a separate witness signature the funding party gives over those four terms alone. Substitute any of them and the recomputed witness no longer matches what was signed, so the transfer reverts before a token moves; a design that left the route outside every signature would let whoever relays the transaction pick a route of its own and keep the difference. Condition (v) is discharged by construction: it custodies no collateral and promises nothing indexed to how the process resolves. This is the general shape: a composer may supply transport for a bilaterally signed commitment, never authority over one &mdash; and over resolution, not even transport.
                    </p>
                    <div className="my-4 overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                            <caption className="caption-bottom pt-2 text-xs text-ink-muted text-left leading-relaxed">
                                The five conditions of Proposition 5.2 against what each preserves and how each
                                is discharged on the two composers of this section. Every entry is checkable
                                before deployment rather than argued afterwards, which is the property the
                                interface-automata reading contributes.
                            </caption>
                            <thead>
                                <tr>
                                    {["Condition", "Preserves", "Attestation coordinator", "Swap-funded commitment coordinator"].map((h) => (
                                        <th key={h} className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading align-top">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    [
                                        "(i) No unauthorized kernel-state mutation",
                                        "status monotonicity, transition correctness, cumulative integrity",
                                        "parametric kernel-immutability properties over every public function; holds nothing but a read-only interface to the kernel",
                                        "discharged rather than evaded — it forwards the parties' own commitment, and the kernel recovers the signatures and pulls each bond itself",
                                    ],
                                    [
                                        "(ii) No alternative settlement path",
                                        "buyer dominance and atomic resolution",
                                        "by construction — no operation invokes any kernel state-changing function",
                                        "the conversion is a funding leg completing before any bonded state exists; no operation moves value out of the kernel",
                                    ],
                                    [
                                        "(iii) No discretionary lock-bypass",
                                        "the no-escape-hatches discipline",
                                        "by construction — no operation transfers tokens from the kernel's bonded balance",
                                        "bond currency and amounts derive from the signed commitment rather than from the caller; no lever is retained once the commitment is in",
                                    ],
                                    [
                                        "(iv) Agreement-bound content (where applicable)",
                                        "the agreement-binding surface downstream consumers rely on",
                                        "the merkle-inclusion gate",
                                        "not engaged — the composer accepts no clause-typed content; the route it does bind travels under a separate witness signature",
                                    ],
                                    [
                                        "(v) No off-kernel side-payment",
                                        "the bond posture as the sole marginal signal",
                                        "by construction — custodies no collateral and promises no payout",
                                        "by construction — custodies no collateral and promises nothing indexed to how the process resolves",
                                    ],
                                ].map((row) => (
                                    <tr key={row[0]}>
                                        <td className="border border-default px-3 py-1.5 align-top font-medium text-ink-heading">{row[0]}</td>
                                        <td className="border border-default px-3 py-1.5 align-top">{row[1]}</td>
                                        <td className="border border-default px-3 py-1.5 align-top">{row[2]}</td>
                                        <td className="border border-default px-3 py-1.5 align-top">{row[3]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </PaperSubsection>
                <PaperSubsection title="5.4 What the pattern is not">
                    <p>
                        The pattern is not a generic external-call disclaimer. A mechanism that reads kernel state and returns derived values is composition-safe almost trivially; a mechanism that calls a kernel state-changing function is composition-safe only in the narrow sense condition (i) admits &mdash; as transport for a commitment the parties themselves signed, which the kernel authenticates for itself before pulling either bond. There is no delegation construct behind that and the pattern supplies none: the kernel recovers signatures from the parties&rsquo; own keys, and at resolution it authorizes on the calling address, so no composer holds authority over a commitment on another party&rsquo;s behalf and none can be granted one.
                    </p>
                    <p>
                        Nor is the pattern a substitute for the clause-design discipline, and the two are complementary rather than independent: condition (iv) is the point at which one reaches into the other, and it reaches only halfway. What it requires is a <em>binding</em> check &mdash; that the clause was part of the agreement both parties signed &mdash; and it says nothing about whether the content filed under that clause is well-formed. That second question belongs to Section 4 and is answered where Section 4 answers it: off-chain at both signing points and at read time, and inside the generic engine on the batched path. A composition is protocol-grade only when both hold, the coordinator conditions governing what it may touch and the clause discipline governing what its content means.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Worked Instances: Three Compositions the Rules License">
                <p>
                    The two rules developed above &mdash; the decision rule of Proposition 3.2 for what belongs in the protocol, and the coordinator conditions of Proposition 5.2 for what may be composed against the kernel &mdash; are stated abstractly, and abstract rules invite the reading that composition is a single named possibility rather than a discipline with a range. This section works three concrete compositions through both rules. They are chosen because they occupy different positions with respect to the kernel: one attaches to the secured process graph and earns a protocol anchor, and two are licensed precisely by being kept out of the protocol. The negative results are the more instructive half, because a decision rule that only ever admits is not a decision rule.
                </p>
                <PaperSubsection title="6.1 An arbitration forum&rsquo;s ruling as resolution input">
                    <p>
                        Two parties may name a dispute forum in the agreement they sign &mdash; a decentralized arbitration court, an institutional arbitral body, a named seat and governing law. The naming is a clause: the forum&rsquo;s identity and the procedural terms under which it is seised are definitions whose interpretation must hold across both counterparties and across time, they attach to the process being secured rather than to private instance data, and their reference integrity has to survive the years a dispute may take to mature. All three conditions of Proposition 3.2 are met, so this composition earns an anchor, and it takes the ordinary form: one clause identity per forum, registered under the sister-clause pattern of Section 4.5, so that no forum is privileged by the protocol and a new one is added by registering a sibling rather than by amending anything.
                    </p>
                    <p>
                        What the forum consumes is the record: the settlement byproducts the kernel emits by construction &mdash; the dual-signed commitment digest, the bond deposits, the accumulator state, the resolution or its conspicuous absence, each block-timestamped &mdash; together with the clause-typed attestations filed against the same agreement hash. What the forum produces is a ruling. The load-bearing point is what the ruling is <em>not</em>: it is not a kernel operation. The kernel exposes no third-party resolution path, and adding one would be exactly the exit action the escape-hatch theorem rules out &mdash; resolution turning on an unbonded party outside the bond structure. A ruling therefore acts at the two places available to it. It enters the buyer&rsquo;s decision at the only lever the kernel has, the buyer&rsquo;s own resolution; and it stands as an obligation enforceable in the forum&rsquo;s own venue against a party who ignores it, on the ordinary terms by which arbitral awards are enforced.
                    </p>
                    <p>
                        Against Proposition 5.2 the composition is almost trivially clean: the forum writes no kernel state, holds no party role, custodies no bond, and provides no alternative settlement path, discharging (i) through (iv) by having no on-chain relationship to the kernel at all. Condition (v) is the one that does work here, and it is worth seeing it bite. A forum that custodied its own collateral and paid a party out of it, indexed to how the kernel resolved, would satisfy every other condition while reintroducing an unbonded actor into the parties&rsquo; calculus &mdash; the bond posture would no longer be the sole marginal signal. A forum that rules and leaves enforcement to its own venue does not. Finally, the composition is an accelerant and not a precondition: where the parties named no forum, the record is still admissible on its own terms and either party may bring it to whatever forum has jurisdiction. Composing the clause fixes the venue in advance; it does not create the recourse.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.2 A wallet-side swap as denomination on-ramp">
                    <p>
                        A process is bound to one denomination for its whole life. This is a kernel-level scope exclusion rather than a limitation awaiting relief: the bond arithmetic compares a buyer&rsquo;s <Math>{"2P"}</Math> with a seller&rsquo;s <Math>{"2G"}</Math> in one unit, read directly from chain state, and admitting a second unit into the same process would require a rate &mdash; an oracle, a venue quote, or a pre-agreed conversion &mdash; and each of those is a discretionary or trusted input in the resolution path. So the question a participant holding some other token actually faces is not how the kernel might accommodate it, but where the conversion happens.
                    </p>
                    <p>
                        It happens before the bonded state exists. In the simplest form the party swaps at a public venue in one transaction and commits in another; by the time the signed commitment reaches the kernel, the party holds the process denomination and the kernel sees an ordinary commit with nothing composed onto it. The swap-funded composer of Section 5.3 is the same act with tighter packaging &mdash; the conversion and the commitment in one transaction, with the route bound into the funding party&rsquo;s own witness signature, separate from the bilateral commitment that fixes only the bond currency and the amounts, so the party cannot be routed somewhere it did not agree to &mdash; and it is the harder case, which is why it was treated there under condition (i) rather than here.
                    </p>
                    <p>
                        The plain wallet-side swap is the instructive case for the decision rule, because the rule rejects it as a protocol composition and is right to. It fails Proposition 3.2&rsquo;s first condition outright: the swap attaches meaning to a wallet&rsquo;s own treasury operations, not to the secured process graph. There is nothing about it a counterparty must share an interpretation of, and nothing whose reference integrity the protocol must preserve. Anchoring it would produce exactly the fake-ontology over-generality the second guardrail warns against. The correct outcome is that the venue stays a venue and the protocol never learns the swap occurred. Two consequences worth stating plainly, because they are routinely conflated: an on-ramp is never a denomination &mdash; the process denominates in one unit whatever the parties held beforehand &mdash; and a participant who wants to transact across several units does so as several independent single-denomination processes, not as one process holding several.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.3 Payout routing as the ordinary next act after settlement">
                    <p>
                        Resolution pays each leg to the address that signed for it: one recipient per leg, by the kernel&rsquo;s own arithmetic, with no splitting construct and no payout schedule. A settled party very often wants the opposite &mdash; to divide what it just received among several earmarked destinations: a fiscal remittance, an obligation to a lender or a cooperative, a savings position, a share to contributors who worked off the bonded chain. It does that by dispersing its own receipts to several addresses in one subsequent transaction, through an ordinary batch-dispersal contract of the kind public networks already carry.
                    </p>
                    <p>
                        This is a default of settlement in the plain sense &mdash; the common thing a settled wallet does next, and a surface worth offering beside the proceeds &mdash; and in no other sense. Nothing about it is automatic; the kernel neither triggers it nor could observe that it occurred; and it happens strictly downstream of the bonded state, on funds that are already the recipient&rsquo;s. Against Proposition 5.2 the composition does not even arise: the dispersal contract reads no kernel state, writes none, custodies no bond, and holds no relation to any process. Against Proposition 3.2 it fails the first condition for the same reason the swap does, and belongs where it sits, at the wallet edge.
                    </p>
                    <p>
                        Its interest is evidentiary rather than structural. Because the routing happens on the same public ledger as the settlement that funded it, the trail is a byproduct rather than a filing: each disbursed leg is reconcilable against the settlement it came out of, by anyone, without the recipient maintaining a separate account of it. A participant who wants to demonstrate to a tax authority, a lender, or a cooperative&rsquo;s membership where its receipts went can point at the chain instead of at a bookkeeping claim &mdash; and this holds without the protocol having modeled fiscal routing at all, which is the property the decision rule was protecting when it kept the routing out.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.4 What the three have in common">
                    <p>
                        Only one of the three earns a protocol anchor. That ratio is the discipline working rather than an accident of selection: the protocol grows by the rule&rsquo;s admissions, and it stays legible by the rule&rsquo;s refusals. The common structure across all three is that the kernel&rsquo;s two operations are never made to do more than they do &mdash; the forum rules but does not resolve, the venue converts but does not denominate, the disperser divides but only what a party already holds &mdash; and each composition takes its position either before the bonded state begins, alongside it as a reader, or after it ends. Nothing reaches into the interval in which the bonds are locked. A composition proposal is best tested by asking which of those three positions it occupies; a proposal that occupies none of them is asking for a lever inside the bonded interval, and the escape-hatch theorem is the reason there is none to give.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    Above the kernel sits a protocol layer: compositions under the doctrine, clause discipline, and coordinator pattern of Sections 3&ndash;5, exercised on concrete instances in Section 6. That layer is a research object in computer-science register, with a discipline derived from the kernel&rsquo;s security requirements rather than from convenience or developer ergonomics.
                </p>
                <p>
                    The protocol-composition doctrine produces a decision rule (Proposition 3.2) for whether a proposed feature belongs in the protocol; clause design produces a canonical specification with derived enforcement layers under append-only identity and first-write-wins registration, made attestable by merkle-binding against the signed agreement; the coordinator pattern produces formal sufficient conditions (Proposition 5.2) under which a composition preserves the kernel&rsquo;s invariants and the payoff structure its equilibrium argument rests on. Together they make composition onto the kernel a rigorous engineering practice rather than an opinion-driven one.
                </p>
                <p>
                    The contribution is the discipline itself, made explicit and research-grade: how the kernel becomes a protocol, with the discipline at each layer specified well enough that a composition author can apply it.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
