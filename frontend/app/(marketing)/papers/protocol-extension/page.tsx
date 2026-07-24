import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "Protocol Composition: Clause Design, the Coordinator Pattern, and Runtime Architecture Above the Kernel — Figaro Protocol",
    description:
        "The kernel becomes a protocol when work is composed onto it without weakening its equilibrium. A decision rule for protocol composition, clause design as a verification discipline, the coordinator pattern's sufficient conditions for equilibrium-preserving composition, and the runtime composition pipeline above the protocol tier.",
};

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

const CATALOGUE: [string, string][] = [
    ["Commerce", "currency, payment, and line items — committed by the seller at commit"],
    ["Topology", "DAG lineage; agreement-only, with no runtime attestation"],
    ["Geolocation", "origin / destination geohash"],
    ["Modalities", "the buyer's requested modality: on-site, pickup, delivery, or virtual"],
    ["Handoff", "the point where a physical exchange occurs"],
    ["Cargo", "logistic-unit shipment measure: mass, volume, packaged dimensions, packaging"],
    ["Cold chain", "temperature-controlled handling class committed at signing; the period record filed as a runtime witness stage"],
    ["Emissions", "accounting methodology committed at signing; measured grams CO₂e filed as a runtime witness stage on the same clause"],
    ["Proximity policy", "accepted detection bands committed at signing; the hand-off proof filed as a runtime witness stage on the same clause"],
    ["Merchant process", "merchant per-role event ladder"],
    ["Courier process", "courier per-role event ladder"],
    ["Arbitration (Kleros)", "off-chain arbitration-forum selection"],
    ["Applicable law", "governing-law and recourse layer"],
    ["Consent", "cryptographic acceptance of an off-chain document"],
];

export default function ProtocolExtensionPaper() {
    return (
        <PaperLayout slug="protocol-extension"
            title="Protocol Composition: Clause Design, the Coordinator Pattern, and Runtime Architecture Above the Kernel"
            subtitle="Clause Design, the Coordinator Pattern, and the Software Architecture Above the Kernel"
            author="Alessandro Daliana"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="protocol composition, clause design, coordinator pattern, equilibrium-preserving composition, runtime architecture, software composition, content-addressed identity"
            abstract={
                <>
                    <p>
                        The Figaro kernel is a settlement primitive: a dual-signed commitment and a buyer-only atomic resolution, with no upgrade path and no escape hatches. Its mechanism-design derivation (asymmetric bonding, buyer dominance with atomic resolution, and the escape-hatch-weakness theorem) and its multi-method formal verification are treated separately and stay strictly at the kernel tier.
                    </p>
                    <p>
                        This paper covers what stands above the kernel as a research object. The kernel by itself is not a useful protocol; it becomes one when compositions are layered onto it. Four discipline questions arise. When should a protocol composition be written, and what does it mean for a composition to preserve the kernel&rsquo;s equilibrium properties? The <em>protocol composition doctrine</em> answers with the anchored artifact pattern, append-only identity, first-write-wins binding, and the boundary between per-instance payloads and shared reference semantics. How should new clauses be designed and verified? We treat <em>clause design as a computer-science discipline</em>: a canonical specification, content-addressed registration, and the merkle-binding under which a registered clause becomes immediately attestable without any per-clause on-chain code. How does the <em>coordinator pattern</em> preserve the bonding equilibrium when an external mechanism is composed onto the kernel? We define composition semantics, state sufficient conditions for equilibrium preservation, and treat the attestation coordinator as the worked verification example. Finally, how is the <em>runtime composition</em> organized above the protocol tier? We describe the seven-layer composition pipeline, the assembly registry pattern, the module system, the designer canvas, and the publication/transaction route-architecture split.
                    </p>
                    <p>
                        The paper is in computer-science register: software architecture as a research object, with the discipline derived from the kernel&rsquo;s security requirements rather than from convenience.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bloemen, R., Logvinov, L., &amp; Evans, J. EIP-712: Typed Structured Data Hashing and Signing. Ethereum Improvement Proposal 712, September 2017.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The Figaro kernel is a settlement primitive whose frozen invariants produce a Nash equilibrium under asymmetric bonding rules and buyer dominance with atomic resolution. As deployed, the kernel satisfies those invariants under multiple formal-verification methods. The kernel itself stops at its boundary because that is where the formal results live.
                </p>
                <p>
                    The kernel by itself is not a useful protocol. A settlement primitive needs a graph above it that participants can compose: clauses typing the agreement content, mechanism contracts coordinating specific patterns, runtime surfaces letting humans and agents interact with the resulting institutional shapes. The graph is what makes the kernel applied; the kernel is what makes the graph trustworthy. The discipline that governs the graph &mdash; how protocol compositions are written and how runtime compositions are organized &mdash; is the subject of the present paper.
                </p>
                <p>The argument is in four parts.</p>
                <PaperRun title="The protocol composition doctrine.">
                    Compositions must preserve the kernel&rsquo;s equilibrium properties or they break the protocol; we state a checkable decision rule for whether a new domain feature belongs in the protocol, and develop the anchored artifact pattern as its recurring structural shape.
                </PaperRun>
                <PaperRun title="Clause design as a computer-science discipline.">
                    A Figaro clause is a typed-data definition under append-only identity discipline, registered permissionlessly first-write-wins, content-addressed to its canonical specification, and made attestable by merkle-binding against the signed agreement.
                </PaperRun>
                <PaperRun title="The coordinator pattern formally.">
                    An external mechanism composes with the kernel without breaking the bonding equilibrium when it satisfies specified conditions on its read/write profile against kernel state; we state the conditions with composition semantics and prove they are sufficient, with the attestation coordinator as the worked verification example.
                </PaperRun>
                <PaperRun title="Runtime composition.">
                    Above the protocol tier, institutional assemblies, mechanism packages, service bindings, view definitions, and branding fields compose into rendered institutions that humans and agents interact with; the runtime is software architecture, not user-experience design, and we treat it as a CS object.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>The bonded primitive&rsquo;s mechanism-design derivation and its formal verification are out of scope for the present paper. We summarize the kernel features the present paper relies on.</p>
                <PaperRun title="Kernel surface.">
                    Two state-changing operations: a <em>commit</em> (dual-signed EIP-712 commitment, locks asymmetric bonds) and a <em>resolution</em> (buyer-only, atomic settlement of all orders in a process). Three pieces of stored state: per-process state (the root buyer, currency, cumulative value, and active-order count), per-order status, and the order-to-process mapping.
                </PaperRun>
                <PaperRun title="Six invariants.">
                    (i) asymmetric bonding (buyer locks <Math>{"2P"}</Math>, seller locks <Math>{"2G"}</Math>); (ii) cumulative upstream bonding across <Math>{"N"}</Math>-party process chains; (iii) buyer dominance (only the root buyer can resolve); (iv) atomic resolution (all active orders settle simultaneously or not at all); (v) immutable evidence (commits and resolutions emit unmodifiable events); (vi) no escape hatches (no admin, no timeout, no governance, no unilateral exit).
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
                <PaperSubsection title="3.2 The anchored artifact pattern">
                    <p>
                        The recurring structural shape of a Figaro composition is the <em>anchored artifact pattern</em>: off-chain semantics (the document, the methodology, the field catalogue, the legal interpretation) plus an on-chain anchor for shared reference integrity. An anchored artifact family exists when (1) multiple parties or tools must share a stable interpretation of some referenced artifact; (2) that interpretation must remain auditable over time; (3) the protocol needs a minimal on-chain reference point for that artifact family. The anchor carries only what the chain needs to identify the artifact, verify that the off-chain document referenced is the one that was committed, and check that the artifact was admitted for use at the time of reference; it does not carry the semantics themselves.
                    </p>
                    <FormalBlock label="Definition 3.1 (Anchor record).">
                        <p>
                            A protocol-layer anchor for an artifact family is a tuple <Math>{"\\langle \\text{clauseId}, \\text{version}, \\text{uriHash}, \\text{admitted} \\rangle"}</Math>: clauseId the anchor identity, version the version within the family, uriHash an immutable cryptographic hash of the URI pointing at the off-chain content, and admitted the binding&rsquo;s monotone admission flag (false until first registration, true thereafter; the discipline forbids deactivation). The registry stores only the admission flag as queryable state; version and uriHash live on the registration event log, and the conceptual anchor is reconstructed by reading that log under the append-only-identity discipline of Section 4.2.
                        </p>
                    </FormalBlock>
                    <p>
                        The minimal-anchor surface is intentional: larger anchors would freeze interpretive commitments into brittle on-chain state; smaller anchors would lose reference integrity. The four-field shape is the narrowest surface that supports cross-party agreement on which artifact is referenced and which version of it.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.3 Per-instance payloads versus shared reference semantics">
                    <p>
                        The discipline turns on a load-bearing distinction between <em>per-instance payloads</em> and <em>shared reference semantics</em>. Per-instance payloads are operational data values: specific delivery details, sealed address data, notes for a particular delivery event. These are typically private, mutable at the business level, or specific to one workflow instance; they do not deserve a protocol-level anchor and live as instance data on the order or process that carries them. Shared reference semantics are definitions whose interpretation must remain stable across counterparties, tools, or time: a disclosure clause, a bill-of-lading clause family, a certification framework reference, a quality-assurance reference standard. These may justify a protocol-level anchor under the anchored artifact pattern.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.4 The decision rule">
                    <FormalBlock label="Proposition 3.2 (Decision rule for protocol composition).">
                        <p>A new domain feature belongs in the protocol if and only if all three of the following hold: (1) the feature attaches meaning to the secured process graph rather than to private instance data; (2) the feature requires stable shared interpretation across counterparties or tools; (3) the protocol needs to preserve that reference integrity over time. A feature satisfying all three conditions is a candidate for the anchored artifact pattern. A feature failing any of the three belongs in app logic, off-chain infrastructure, or per-instance payload handling.</p>
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
                        The guardrails are the operational restatement of the rule, and their central tension is between under- and over-generality: under-generality fragments the protocol into one-off app-specific modules and incompatible bilateral arrangements; over-generality produces a fake universal ontology and protocol bloat that mistakes possibility for scope. A proposed composition is at the right level of generality if at least two distinct domains have plausibly demonstrated need for the same coordination primitive, and the primitive can be specified narrowly enough to support both without becoming a universal-ontology object.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Clause Design as a CS Discipline">
                <p>
                    A Figaro clause is the concrete realization of an anchored artifact family. Designing a clause is the operational form of applying the composition doctrine. We treat the discipline in computer-science register: typed-data design, content-addressed composition, verification-stack architecture.
                </p>
                <PaperSubsection title="4.1 The clause specification and its enforcement layers">
                    <p>A protocol-tier clause is realized across coordinated layers that together discharge the clause&rsquo;s correctness. The canonical specification is authoritative; every other layer is derived from it, and the on-chain enforcement is a merkle binding against the signed agreement rather than a per-clause on-chain validator.</p>
                    <PaperRun title="Canonical specification.">
                        A canonical specification of the clause, parsed by a meta-validator over a closed subset of structured-data types (strings with specified formats, integers, arbitrary-precision integers as decimal strings, booleans, enums, arrays, and objects, with strict rejection of unknown fields). Per-stage overrides express the staged-attestation pattern (an <em>applied</em>-stage attestation may carry different fields than an <em>inspected-intact</em>-stage attestation against the same clause), and a short list of non-normative category tags forms the discoverability surface for the clause&rsquo;s runtime presentation.
                    </PaperRun>
                    <PaperRun title="Off-chain well-formedness validator.">
                        A client-side implementation of the specification&rsquo;s well-formedness check, run at both bilateral signing points (so neither party signs content the specification would reject) and at read time (so a consumer can re-check an attestation against the clause it was filed under). It decodes the clause&rsquo;s canonical content encoding and rejects on any violation; there is no on-chain per-clause content validation.
                    </PaperRun>
                    <PaperRun title="Prover mirror (deferred).">
                        A faithful re-implementation of the well-formedness validator running inside a zero-knowledge prover, producing verifiable attestation receipts during batched off-chain execution. The layer is specified and its port is pending; the canonical specification and its off-chain validator are the port&rsquo;s conformance specification.
                    </PaperRun>
                    <PaperRun title="On-chain merkle binding.">
                        The attestation coordinator binds each attestation to the order&rsquo;s signed agreement by verifying a merkle-inclusion proof of the clause section against the agreement hash, and content-hashes the supplied evidence. It validates no clause content shape and invokes no per-clause validator; truth-of-content is an off-chain concern.
                    </PaperRun>
                    <PaperRun title="Runtime-tier binding and the lockstep contract.">
                        A frontend integration consumes the canonical specification — shaping clause-typed forms from the spec and validating the assembled agreement&rsquo;s content against it before either party signs — then carries the encoded content to chain; an unintegrated clause exists on chain and not in any product. A new clause is not done until the canonical specification, its off-chain validator, and its runtime binding ship in lockstep: if the specification says one thing and a derived layer enforces another, attestations silently divide into two interpretations and the clause&rsquo;s reference integrity collapses. The lockstep contract is operational discipline rather than a formal soundness theorem, enforced by deriving every layer from the single canonical specification and by a test suite covering well-formed input plus every rejection path.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.2 Append-only identity">
                    <p>Clause identity is append-only. The discipline produces three operational rules:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        <li>No in-place rewriting of clause meaning. A registered clause cannot be modified through any contract operation; the clause record at clauseId is immutable from the moment of registration.</li>
                        <li>No silent mutation of the content reference behind an existing identity. The uriHash field of the anchor is immutable; off-chain documents may be mirrored for availability but the canonical reference is the hash, not any URI.</li>
                        <li>New meaning requires a new version or a new clause identity. A clause family that needs a substantive change registers a new clauseId at the next version; it never mutates the existing version&rsquo;s anchor or its canonical specification.</li>
                    </ol>
                    <p>The append-only rule preserves historical interpretability: attestations remain readable against the exact clause anchor they were filed under, regardless of subsequent clause-family evolution.</p>
                </PaperSubsection>
                <PaperSubsection title="4.3 First-write-wins registration">
                    <p>
                        Clause registration is permissionless and first-write-wins. Any address may register a clauseId; the registration binds that clauseId&rsquo;s anchor permanently, and a subsequent attempt to register the same clauseId is rejected. The discipline is deliberate: an admin-mediated registry would re-introduce governance authority over the clause surface; a permissionless registry without first-write-wins would let any address overwrite an existing anchor and break in-flight attestations. The combination is the only design that satisfies both no-admin and no-overwrite.
                    </p>
                    <PaperRemark title="Why first-write-wins is structurally necessary.">
                        Consider the alternatives. <em>Admin-mediated registration</em> re-introduces the discretionary actor the no-escape-hatches discipline rules out. <em>Mutable anchors</em> let any address rewrite an anchor, breaking existing attestations under that clauseId. <em>Time-locked anchors</em> buffer the overwrite, but any non-zero delay creates a window in which the anchor is uncertain. First-write-wins produces an anchor that is both permissionless and stable: anyone can register it once; no one can change it after.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="4.4 Immediate attestability">
                    <p>
                        Because the on-chain layer performs no per-clause content validation, a clauseId is attestable the moment it is registered: there is no second binding step to race, and therefore no front-running window between registration and the clause becoming usable. This is the open-world property stated operationally &mdash; a never-before-seen clause, registered permissionlessly, is immediately attestable against any order whose signed agreement included it, with zero per-clause on-chain code. The only on-chain admission gate is the merkle-inclusion proof that the clause was part of the bilateral agreement; truth-of-content is an off-chain specification-plus-read-time concern.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.5 The reference clause catalogue">
                    <p>The protocol currently ships a coordinated set of reference clauses, treated as a reference set rather than as independent compositions. Among them:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        {CATALOGUE.map(([id, desc]) => (
                            <li key={id}><em>{id}</em> &mdash; {desc}</li>
                        ))}
                    </ol>
                    <p>
                        The catalogue exhibits several reusable patterns. The <em>sister-clause pattern</em> (the merchant and courier process clauses; the provider-specific arbitration clause beside future <code>figaro-arbitration-&lt;provider&gt;</code> siblings) supplies multiple specialized variants of a shared coordination concept: content shape is shared, clauseId is per-variant, and a new sibling can be registered without affecting the others. The <em>witness-stage pattern</em> keeps a committed policy and its runtime proof on a single clause rather than splitting one concept across two: a clause commits its policy at agreement signing (fixed for the order&rsquo;s life), and any runtime proof of that policy is filed during execution as a runtime attestation on that same clause, its content shape declared as a witness stage in the specification. Emissions commits an accounting methodology and carries measured grams CO&#8322;e as its witness stage; proximity policy commits the accepted detection bands and carries the detected-band hand-off proof as its witness stage. Every clause section — committed policy or runtime witness — is a merkle leaf under the same agreement hash: there is no separate &ldquo;cross-checked&rdquo; tier and no separate &ldquo;runtime&rdquo; tier, only a difference in <em>when</em> the content is supplied. The <em>agreement-only clause</em> pattern (the topology clause) is a shared-vocabulary anchor whose enforcement is purely off-chain: parties commit to the topology at contract-signing time, the indexer reconstructs the DAG from event logs, and no runtime attestation fires.
                    </p>
                    <PaperRun title="Class A and Class B records.">
                        A useful evidentiary taxonomy distinguishes records the kernel produces by construction from records participants attest under clause discipline. <em>Class A</em> records are kernel byproducts (commitment digest, bond deposits, cumulative-value accumulator state, order status transitions, resolution events): emitted by the kernel, typed at the kernel level, discretion-free, and cryptographically authenticated. <em>Class B</em> records are discretionary clause-typed attestations (delivery confirmations, emissions disclosures, handoff attestations, custody-of-seal events, lifecycle stage transitions): produced through the attestation coordinator, typed at the <em>protocol</em> level, merkle-bound to the signed agreement, and substantively contestable on truth-of-content grounds. The clause-design discipline of this paper produces Class B records.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.6 What clause design is not">
                    <p>
                        Three classes of would-be composition fall outside the discipline. <em>Per-instance payload clauses</em>: most order-specific data does not need a registered clause; it needs an order-specific encoder and an off-chain decoder. The decision rule (Proposition 3.2) asks whether the shape needs stable shared interpretation across parties or tools &mdash; if not, the data is a payload, not a clause candidate. <em>Clauses with mutable freeform text or large on-chain payloads</em> (typically larger than ~1KB): mutable freeform text violates append-only identity; large payloads violate the minimal-anchor surface. <em>Clauses with admin, pause, or upgrade hooks</em>: the no-escape-hatches discipline applies to clauses as it applies to the kernel; an admin-controlled clause surface re-introduces the discretionary actor.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. The Coordinator Pattern">
                <p>
                    We turn now to the second discipline question: under what conditions does an external mechanism contract compose with the kernel without breaking the bonding equilibrium? The discipline that answers this is the <em>coordinator pattern</em>: a set of sufficient conditions on a composition contract&rsquo;s read/write profile against kernel state under which the bonding equilibrium is preserved by composition.
                </p>
                <PaperSubsection title="5.1 Composition semantics">
                    <p>
                        Let <Math>{"\\mathcal{K}"}</Math> denote the Figaro kernel as a state machine with state space <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math> (the values of the kernel&rsquo;s stored mappings) and transition function <Math>{"\\delta_{\\mathcal{K}}"}</Math> restricted to commit and resolution. Let <Math>{"\\mathcal{M}"}</Math> denote an external mechanism contract with state space <Math>{"\\mathcal{S}_{\\mathcal{M}}"}</Math> and transition function <Math>{"\\delta_{\\mathcal{M}}"}</Math>.
                    </p>
                    <FormalBlock label="Definition 5.1 (Composition).">
                        <p>
                            We extend the state space to include the kernel contract&rsquo;s ERC-20 token-balance position <Math>{"\\beta_{\\mathcal{K}}"}</Math> and the event log <Math>{"E_{\\mathcal{K}}"}</Math> alongside <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math> proper. The composition <Math>{"\\mathcal{K} \\otimes \\mathcal{M}"}</Math> is the joint state machine over the extended state space in which <Math>{"\\mathcal{M}"}</Math> may read from <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, <Math>{"\\beta_{\\mathcal{K}}"}</Math>, and <Math>{"E_{\\mathcal{K}}"}</Math> but may not write to any of them, and <Math>{"\\mathcal{K}"}</Math> neither reads from nor writes to <Math>{"\\mathcal{S}_{\\mathcal{M}}"}</Math>. The composition&rsquo;s transition function admits interleaving via the EVM call graph (an <Math>{"\\mathcal{M}"}</Math> transition&rsquo;s call frame may invoke <Math>{"\\mathcal{K}"}</Math>&rsquo;s public methods, but only subject to condition (i) of Proposition 5.2 below).
                        </p>
                    </FormalBlock>
                    <p>
                        The asymmetric read/write structure is the load-bearing constraint: <Math>{"\\mathcal{M}"}</Math> may consult kernel state but cannot modify it, and the kernel is composition-blind &mdash; it neither knows nor needs to know about <Math>{"\\mathcal{M}"}</Math>. The extended state space matches the operational semantics of EVM contracts: cumulative upstream bonding involves <Math>{"\\beta_{\\mathcal{K}}"}</Math> (the kernel&rsquo;s bonded balance) as well as <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, and the immutable-evidence invariant is over <Math>{"E_{\\mathcal{K}}"}</Math> rather than purely over state mappings.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.2 The coordinator pattern, formally">
                    <FormalBlock label="Proposition 5.2 (Equilibrium-preserving composition).">
                        <p>The composition <Math>{"\\mathcal{K} \\otimes \\mathcal{M}"}</Math> preserves the kernel&rsquo;s bonding equilibrium if <Math>{"\\mathcal{M}"}</Math> satisfies all five of the following conditions:</p>
                        <ul className="space-y-1 list-none pl-0 text-sm">
                            <li>(i) <em>Read-only on kernel state.</em> No <Math>{"\\mathcal{M}"}</Math> operation can mutate kernel state: the call frame on which <Math>{"\\mathcal{M}.f"}</Math> executes does not invoke the kernel&rsquo;s commit or resolution operations in a way that produces unauthorized state mutation.</li>
                            <li>(ii) <em>No alternative settlement path.</em> <Math>{"\\mathcal{M}"}</Math> does not provide an operation that produces value flows equivalent to the kernel&rsquo;s atomic resolution but bypasses it or modifies its preconditions.</li>
                            <li>(iii) <em>No discretionary lock-bypass.</em> <Math>{"\\mathcal{M}"}</Math> does not release bonded funds from <Math>{"\\mathcal{K}"}</Math>&rsquo;s bonded balance under conditions different from those the kernel&rsquo;s resolution enforces.</li>
                            <li>(iv) <em>Agreement-bound content (where applicable).</em> If <Math>{"\\mathcal{M}"}</Math> accepts content typed by a registered clauseId, it admits the content only against an order whose signed agreement included that clause, verified by a merkle-inclusion proof of the clause section against the agreement hash; content for a clause not present in the bilateral agreement is rejected.</li>
                            <li>(v) <em>No off-kernel side-payment.</em> <Math>{"\\mathcal{M}"}</Math> does not commit, on-chain or off-chain, to award value to a party contingent on the kernel&rsquo;s resolved bond outcome. A mechanism reading kernel state under conditions (i)&ndash;(iv) may still promise a payout from collateral it custodies off the kernel, indexed to how the kernel resolves; this condition excludes that.</li>
                        </ul>
                    </FormalBlock>
                    <PaperRun title="Proof sketch.">
                        Each condition preserves a distinct part of the kernel&rsquo;s claims under composition. Condition (i) preserves the kernel state predicates the verification stack establishes (status monotonicity, transition correctness, cumulative integrity): if <Math>{"P : \\mathcal{S}_{\\mathcal{K}} \\to \\mathrm{Bool}"}</Math> is invariant under <Math>{"\\delta_{\\mathcal{K}}"}</Math> and <Math>{"\\delta_{\\mathcal{M}}"}</Math> does not change <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, then <Math>{"P"}</Math> is invariant under <Math>{"\\delta_{\\mathcal{K} \\otimes \\mathcal{M}}"}</Math>, the disjoint union of the two transition functions. Condition (ii) preserves buyer dominance and atomic resolution by ruling out alternative paths that would bypass them &mdash; an alternative settlement path is exactly the escape hatch the escape-hatch-weakness theorem forbids. Condition (iii) preserves the no-escape-hatches discipline by ruling out lock-bypass. Condition (iv) preserves the agreement-binding surface: a mechanism accepting content under a clauseId not present in the order&rsquo;s signed agreement creates a content surface downstream consumers cannot trust. Condition (v) preserves the on-chain bond ratio as the marginal economic signal: a mechanism that custodies its own off-chain collateral and promises a party a payout indexed to the kernel&rsquo;s resolved state satisfies (i)&ndash;(iv) &mdash; it touches no kernel bonds and bypasses no kernel transition &mdash; yet reintroduces an unbonded actor, the side-payment custodian, into the parties&rsquo; decision calculus, so the bond ratio is no longer the sole marginal signal and the equilibrium argument degrades. The five are jointly sufficient, and necessary in the worst case &mdash; relaxing any one produces a documented anti-pattern. We do not claim necessity in every model; weaker conditions on a sufficiently restricted mechanism (e.g., a pure view contract) might suffice for narrower preservation claims.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="5.3 The attestation coordinator as worked example">
                    <p>
                        The attestation coordinator is the canonical worked example: it accepts attestations against bonded orders and emits typed events without ever modifying kernel state, with the merkle-inclusion proof of Section 4 plus a content hash of the supplied evidence as its admission gate. It validates no clause content shape and invokes no per-clause validator, and its verification surface discharges Proposition 5.2&rsquo;s conditions explicitly.
                    </p>
                    <p>
                        Condition (i) is discharged by parametric kernel-immutability properties: over every public function of the coordinator, kernel state before and after execution is unchanged, universally quantified over the coordinator&rsquo;s methods and over kernel-state values. Conditions (ii) and (iii) are discharged by construction: the coordinator has no operation that transfers tokens from the kernel&rsquo;s bonded balance and none that invokes any kernel state-changing function. Condition (iv) is discharged by the merkle-inclusion gate. Condition (v) is discharged by construction: the coordinator custodies no collateral and promises no payout, so it makes no side-payment contingent on the kernel&rsquo;s resolution. The five conditions thus reduce to verification requirements a candidate coordinator can be checked against mechanically.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.4 What the pattern is not">
                    <p>
                        The pattern is not a generic external-call disclaimer: a mechanism that reads kernel state and returns derived values is composition-safe, while one that calls the kernel&rsquo;s state-changing functions on behalf of a third party is composition-safe only if the third-party authorization is properly delegated (a role-resolver interface supplies that delegation pattern). Nor is the pattern a substitute for the clause-design discipline: a mechanism that accepts clause-typed content must admit it only when the clause is bound to the order&rsquo;s signed agreement, and must produce content the clause&rsquo;s off-chain well-formedness check would accept. The two disciplines are independent and both must be satisfied for a composition to be protocol-grade.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Runtime Composition">
                <p>
                    We turn now to the runtime tier: the layer above the protocol where institutional shapes are composed and rendered. The runtime tier is not part of the protocol&rsquo;s verification surface (it does not affect kernel state or the equilibrium) but is part of its deployment surface (without a runtime, the protocol has no participants, only contracts). The discipline here is software architecture: composing institutional shapes from reusable parts without re-implementing the protocol per deployment.
                </p>
                <PaperSubsection title="6.1 Seven-layer composition pipeline">
                    <p>The runtime composes institutional surfaces through seven layers.</p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Protocol truth.</strong> Contract reads, event subscriptions, and the cumulative state derived from them. This layer is authoritative; nothing above it can override it.</li>
                        <li><strong>Semantic derivation.</strong> The derivation of role contexts, capability bindings, mechanism trust boundaries, and guarantee/risk objects from protocol state. Also authoritative: a runtime that renders a role the semantic layer has not derived is rendering a role that is not in the protocol.</li>
                        <li><strong>Institution assembly.</strong> The structural declaration of an institutional shape: which roles compose, which mechanisms are bound, which views are exposed. The assembly is the runtime&rsquo;s canonical document.</li>
                        <li><strong>Mechanism packages.</strong> Reusable units that own a mechanism&rsquo;s contract bindings, semantic adapters, capability mappings, default modules, and guarantee/risk copy. An assembly references packages rather than individual modules.</li>
                        <li><strong>Service bindings.</strong> Off-chain or hybrid infrastructure bindings: identity resolution, catalogue metadata, discovery and search, messaging and handoff, evidence transport, geospatial filtering. The bindings are resolved through stable interfaces, not hardwired per institution.</li>
                        <li><strong>View definitions.</strong> Per-surface UI composition: route or surface id, accepted context, visible slots, module ordering, role-specific visibility.</li>
                        <li><strong>Branding fields.</strong> Presentation-only personalization: theme tokens, imagery, type and spacing preferences, non-semantic copy &mdash; lightweight fields on the seller profile referenced at binding time (accent colour, logo, hero image, theme class) rather than a separate pipeline stage. Branding is a distinct layer because it sits at a distinct trust boundary (presentation-only, never semantic), not because it requires its own composition machinery; branding fields cannot alter capability validity, mechanism authority, risk boundaries, or settlement semantics.</li>
                    </ol>
                    <p>
                        The pipeline is layered: each layer consumes the layers below and produces output for the layers above. Institution-specific mutation lives in layers 3 through 7; the bottom two layers are runtime authority and not institution-overridable.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.2 Assembly registry pattern">
                    <p>
                        An institution assembly is a JSON document declaring the institutional shape: roles, mechanism packages, view definitions, module placements, narrative defaults. The assembly is the runtime&rsquo;s structural primary; the rest of the pipeline is derived from it. The assembly registry pattern handles four operations: <em>discovery</em> (which assemblies exist for a given role, region, or institutional pattern); <em>parsing</em> (validating the assembly&rsquo;s JSON against the runtime&rsquo;s structural specification for assemblies); <em>validation</em> (cross-checking that referenced mechanism packages exist, that view definitions reference valid modules, and that role mappings are coherent); and <em>publication</em> (making a new assembly available, content-addressed for interoperability).
                    </p>
                    <p>
                        The pattern consolidates discovery and indexing (event-derived from the registry&rsquo;s registration logs), content building and canonicalization, and content-addressed publication; fork-and-draft authoring composes on top. An assembly&rsquo;s slug is content-derived &mdash; a hash over the clauses it carries, their values, and the DAG &mdash; so identical compositions map to one slug and the registry&rsquo;s first-write-wins binding dedups them. Published assemblies are event-derived on chain rather than bundled: no slug-to-label taxonomy, no on-disk content list; an assembly&rsquo;s human label is derived from the clauses it composes.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.3 Module system">
                    <p>
                        Modules are the unit the assembly&rsquo;s view definitions place in the rendered surface. A module owns a UI component, a set of typed actions it can dispatch, and the semantic context it consumes. The module registry hosts formally registered modules (seller branding among them); the broader module-shaped concerns &mdash; catalogue editing, cart composition, order creation, attestation submission, delivery coordination, emissions disclosure, florin token operations &mdash; are realized across the runtime library and the component tree under the same composition discipline, whether or not they are formally registered as modules.
                    </p>
                    <p>
                        A module is composition-safe if and only if its dispatched actions go through the typed action model (never direct contract calls) and its semantic context comes from the semantic derivation layer (never local hardcoded state). The discipline mirrors the coordinator pattern at the runtime tier: external mechanisms read kernel state and emit events without writing to the kernel; modules read semantic state and dispatch typed actions without writing to the runtime&rsquo;s authoritative layers.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.4 The lens system">
                    <p>
                        A typed context object &mdash; the <em>lens</em> &mdash; exposes to each module only the constrained subset of runtime state its role context licenses: a buyer-side module receives the buyer&rsquo;s lens onto the process, a seller-side module the seller&rsquo;s, an auditor&rsquo;s module the auditor&rsquo;s; the module cannot reach beyond the lens to other roles&rsquo; state. The lens pattern is the runtime&rsquo;s operational enforcement of the role-segregation the kernel enforces mathematically at the bonding-and-resolution surface (only the buyer can trigger atomic resolution; only a buyer-context module can dispatch buyer-side actions). A runtime that exposed seller-side state to a buyer-context module would let the buyer attempt to submit attestations as the seller &mdash; rejected by the kernel at signature verification, but an attempt the runtime should never have made.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.5 The designer canvas">
                    <p>
                        A specialized runtime surface deserves separate treatment: the assembly designer, which wraps a topology renderer and an agreement drawer for per-node clause binding. The designer is a composition surface where assembly authors fork an existing reference assembly or start from blank, modify the bonded-process graph, bind clauses to nodes through a side drawer, and save drafts. The canvas is not a wizard, not a recommendation engine, not a generative-AI interface; it is a structural editor for assemblies: the runtime&rsquo;s primitives (commerce commitments, proximity-policy hand-off attestations, modalities clauses, and so on) come onto the canvas as draggable elements, and the author composes them into the shape the institutional context requires.
                    </p>
                    <p>
                        The discipline the canvas enforces is structural: an assembly that violates the runtime&rsquo;s composition rules cannot be saved. A fan-out node lacking a corresponding mechanism package, an attestation node referencing an unbound clauseId, mismatched mechanism packages, dangling sub-orders, and topology shapes the runtime does not admit are all surfaced before the draft can be persisted. An author who saves an assembly through the canvas has by construction produced one that satisfies the runtime&rsquo;s structural integrity.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.6 The publication / transaction split">
                    <p>
                        A practical runtime-architecture choice worth naming: the frontend separates routes into a publication tier for explanation-and-reading surfaces and a transaction tier for signing surfaces, reflecting the protocol&rsquo;s trust tiers &mdash; publication is untrusted reading, the transaction tier is signing-required interaction &mdash; rather than collapsing them into one shell. The split has three structural properties.
                    </p>
                    <p>
                        <em>No wallet provider in publication routes.</em> A user who has never connected a wallet must be able to read every publication route. The publication group does not load the wallet provider; the transaction group does. <em>Wallet-connect is a signing prerequisite, not a login.</em> Transaction routes mount the wallet provider but do not gate read-only content behind connection state. Inline write affordances require connection at the moment of signing rather than at route entry. <em>Two distinct headers.</em> The publication header carries reading-oriented navigation; the transaction header carries signing-oriented navigation (wallet connection, orders). The two are not collapsed.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. What the Discipline Refuses">
                <p>
                    The discipline is more visible in what it refuses than in what it admits. Most refusals are already developed above: kernel changes (the kernel is frozen, and the escape-hatch-weakness theorem makes its narrowness a mathematical necessity rather than a stylistic preference), admin paths over registration or mechanism activation (Section 4.3), clauses with mutable freeform text or large payloads (Section 4.6), modules that bypass the typed action model (Section 6.3), and branding that alters semantics (Section 6.1). Four refusals deserve their own statement.
                </p>
                <PaperRun title="Force-majeure escape clauses.">
                    Any proposed composition that lets a participant avoid bond loss in external events (weather, regulatory action, force majeure) is refused. The structural answer is composition with a parallel insurance process, settled independently of the bonded commitment: bonded settlement does not contemplate external-event-conditional release; insurance does; the two compose and neither replaces the other.
                </PaperRun>
                <PaperRun title="Multi-currency cross-leg coordination.">
                    Any proposed composition that lets a process chain denominate different legs in different currencies is refused. Multi-currency coordination requires an external rate of substitution (oracle, DEX, pre-agreed FX rate) that re-introduces a discretionary actor and breaks the same-unit comparability on which the <Math>{"2\\times"}</Math> Nash-stability result rests. Multi-currency coordination at the participant level is achieved through wallet-side swaps before commitment; the kernel sees one currency per process.
                </PaperRun>
                <PaperRun title="Soulbound reputation as protocol primitive.">
                    Any proposed composition that introduces a non-transferable reputation token bound to a wallet at the protocol layer is refused. Reputation is a graph-tier signal, not a kernel-tier construct: settlement history is already on chain and readable as reputation by any party who wants to read it that way, and reifying it into a privileged-credential construct at the protocol layer weakens the kernel&rsquo;s actor-neutrality property.
                </PaperRun>
                <PaperRun title="Fee discounts conditioned on protocol-tier signals.">
                    Any proposed composition that conditions kernel-tier or protocol-tier behavior on a fee discount, a green-bond adjustment, or any other rate-modifying signal is refused. The <Math>{"2\\times"}</Math> bonding ratio is the minimum viable equilibrium under the minimum-multiplier result; a fee-discount mechanism that modifies the effective ratio for some class of participant breaks the equilibrium for that class. Whatever incentive a fee discount would supply belongs at the assembly or seller-registry tier as a parameter the parties choose, not at the bonding rule.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    Above the kernel sits a protocol layer (compositions under the doctrine, clause discipline, and coordinator pattern of Sections 3&ndash;5) and a runtime layer (institutional shapes composed under the discipline of Section 6). Both layers are research objects in computer-science register, and both have a discipline derived from the kernel&rsquo;s security requirements rather than from convenience or developer ergonomics.
                </p>
                <p>
                    The protocol-composition doctrine produces a decision rule (Proposition 3.2) for whether a proposed feature belongs in the protocol; clause design produces a canonical specification with derived enforcement layers under append-only identity and first-write-wins registration, made attestable by merkle-binding against the signed agreement; the coordinator pattern produces formal sufficient conditions (Proposition 5.2) for equilibrium-preserving composition. Together they make composition onto the kernel a rigorous engineering practice rather than an opinion-driven one.
                </p>
                <p>
                    The runtime tier produces a seven-layer pipeline from protocol truth to branding fields, an assembly registry pattern, a module system constrained by the typed action model, a lens system enforcing role-context separation, a designer canvas surfacing discipline at authoring time, and a publication/transaction route split. The runtime tier is not verified the way the protocol tier is, but its discipline is operationally checkable.
                </p>
                <p>
                    The contribution is the discipline itself, made explicit and research-grade: how the kernel becomes a protocol becomes a runtime, with the discipline at each layer specified well enough that a composition author or runtime architect can apply it.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
