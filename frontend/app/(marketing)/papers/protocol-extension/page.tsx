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
    title: "Protocol Extension and Runtime Composition — Figaro Protocol",
    description:
        "The kernel becomes a protocol when extensions compose onto it without weakening its equilibrium. A decision rule for protocol extension, clause design as a four-layer verification discipline, the coordinator pattern's sufficient conditions for equilibrium-preserving composition, and the runtime composition pipeline above the protocol tier.",
};

const CODE_HELPER = `function registerClauseAndValidator(
  bytes32 clauseId,
  uint64 version,
  bytes32 uriHash,
  bytes32 family,
  address validator
) external;`;

function CodeBlock({ children }: { children: string }) {
    return (
        <pre className="paper-code my-4 overflow-x-auto rounded border border-default p-4 text-xs leading-relaxed font-mono text-ink-body whitespace-pre">
            {children}
        </pre>
    );
}

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

const CATALOGUE: [string, string][] = [
    ["figaro-commerce-v1", "currency, payment, line items"],
    ["figaro-geo-v2", "origin / destination geohash"],
    ["figaro-fulfilment-v2", "fulfilment modalities, courier coordinations, and handoff points"],
    ["figaro-topology-v1", "manifest-only clause; no runtime validator"],
    ["figaro-courier-process-v1", "courier per-role event log"],
    ["figaro-merchant-process-v1", "merchant per-role event log"],
    ["figaro-proximity-policy-v1", "committed detection band (Category-2)"],
    ["figaro-proximity-proof-v1", "per-handoff signed witness (Category-1)"],
    ["figaro-consent-v1", "cryptographic acceptance of an off-chain document"],
    ["figaro-arbitration-kleros-v1", "off-chain arbitration-forum selection"],
    ["figaro-applicable-law-v1", "governing-law clause"],
    ["figaro-offset-policy-v1", "carbon-offset retirement policy"],
    ["figaro-ghg-protocol-v1", "GHG Protocol Corporate Standard disclosure (Category-2)"],
    ["figaro-ghg-iso-14064-v1", "ISO 14064 family disclosure (Category-2)"],
    ["figaro-ghg-pas-2050-v1", "PAS 2050 product carbon footprint (Category-2)"],
    ["figaro-ghg-en-16258-v1", "EN 16258 transport-emissions methodology (Category-2)"],
    ["figaro-ghg-custom-v1", "custom / non-standard GHG methodology (Category-2)"],
    ["figaro-ghg-measurement-v1", "runtime grams CO2e (Category-1)"],
];

export default function ProtocolExtensionPaper() {
    return (
        <PaperLayout
            title="Protocol Extension and Runtime Composition"
            subtitle="Clause Design, the Coordinator Pattern, and the Software Architecture Above the Kernel"
            author="Alessandro Daliana"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="protocol extension, clause design, coordinator pattern, equilibrium-preserving composition, runtime architecture, software composition, content-addressed identity"
            abstract={
                <>
                    <p>
                        The Figaro kernel is a settlement primitive: two operations (<code>commit</code> and <code>resolveProcess</code>), three storage mappings, no upgrade path, no escape hatches. Its mechanism-design derivation (asymmetric bonding, buyer dominance with atomic resolution, and the escape-hatch-weakness theorem) and its multi-method formal verification (TLA⁺, symbolic execution, property-based fuzzing, and Certora specifications discharging the kernel&rsquo;s invariants) are treated separately and stay strictly at the kernel tier.
                    </p>
                    <p>
                        This paper covers what stands above the kernel as a research object. The kernel by itself is not a useful protocol; it is a settlement primitive that becomes a protocol when extensions are composed onto it. Three discipline questions arise. First, when should a protocol extension be written, and what does it mean for an extension to preserve the kernel&rsquo;s equilibrium properties? We treat the <em>protocol extension doctrine</em> as the answer: the anchored artifact pattern, append-only identity, first-write-wins binding, the boundary between per-instance payloads and shared reference semantics. Second, how should new clauses be designed and verified at the protocol layer? We treat <em>clause design as a computer-science discipline</em>: the four-layer verification stack (Layer A specification, Layer B prover mirror [pending], Layer C Solidity validator, runtime-tier UI binding), the 18-clause catalogue as a coordinated reference set, and the <code>ClauseRegistrationHelper</code> atomic-bind pattern that closes the front-running window between clause registration and validator binding. Third, how does the <em>coordinator pattern</em> preserve the kernel&rsquo;s bonding equilibrium when an external mechanism is composed onto the kernel? We give a formal definition of composition semantics, state sufficient conditions for equilibrium preservation, and treat the <code>AttestationCoordinator</code> as the worked verification example where the parametric kernel-immutability rules in Certora discharge the conditions. Finally, we describe the <em>runtime composition</em> above the protocol tier: the seven-layer composition pipeline (protocol truth, semantic derivation, institution assembly, mechanism packages, service bindings, view definitions, branding fields), the assembly registry pattern, the module system, the designer canvas, and the <code>(marketing)</code>/<code>(app)</code> route-architecture split.
                    </p>
                    <p>
                        The paper is in computer-science register: software architecture as a research object, with the discipline derived from the kernel&rsquo;s security requirements rather than from convenience.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bloemen, R., Logvinov, L., &amp; Evans, J. EIP-712: Typed Structured Data Hashing and Signing. Ethereum Improvement Proposal 712, September 2017.</li>
                    <li>Certora. <em>Certora Verification Language (CVL): Documentation and Reference</em>. Certora Technical Documentation, 2024.</li>
                    <li>Foundry. <em>Foundry: Ethereum Smart Contract Testing Framework</em>. Foundry Book, 2024.</li>
                    <li>OpenZeppelin. <em>OpenZeppelin Contracts: Reference Implementations for Solidity Patterns</em>. OpenZeppelin Contracts Documentation, 2024.</li>
                    <li>Solidity Team. <em>Solidity Documentation</em>, version 0.8.x series. Ongoing as of 2024.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The Figaro kernel is a settlement primitive whose two operations, three storage mappings, and frozen invariants produce a Nash equilibrium under asymmetric bonding rules and buyer dominance with atomic resolution. As deployed, the kernel satisfies those invariants under multiple formal-verification methods. The kernel itself stops at its boundary because that is where the formal results live.
                </p>
                <p>
                    The kernel by itself is not a useful protocol. A settlement primitive needs a graph above it that participants can compose: clauses typing the agreement content, mechanism contracts coordinating specific patterns, runtime surfaces letting humans and agents interact with the resulting institutional shapes. The graph is what makes the kernel applied; the kernel is what makes the graph trustworthy. The two are inseparable in any working deployment, and the discipline that governs the second half &mdash; how protocol extensions are written and how runtime compositions are organized &mdash; is the subject of the present paper.
                </p>
                <p>The argument is in three parts.</p>
                <PaperRun title="The protocol extension doctrine.">
                    Extensions to the kernel must preserve the kernel&rsquo;s equilibrium properties or they break the protocol. The discipline is therefore not a matter of taste: there is a decision rule for whether a new domain feature belongs in the protocol or stays in app logic, and the rule is checkable. We state the rule, develop the anchored artifact pattern as the recurring structural shape, and identify the design guardrails the rule produces.
                </PaperRun>
                <PaperRun title="Clause design as a computer-science discipline.">
                    A Figaro clause is not a JSON document on a filesystem. It is a typed-data definition deployed across four coordinated layers (specification, prover mirror, on-chain validator, runtime-tier binding) under append-only identity discipline, with first-write-wins binding to the validator contract and content-addressed reference to the specification document. The discipline is a computer-science research object, not just an implementation detail, and we treat it as such. The 18-clause catalogue currently shipped in the protocol is the worked-example reference set.
                </PaperRun>
                <PaperRun title="The coordinator pattern formally.">
                    The <em>coordinator pattern</em> is the discipline under which an external mechanism contract composes with the kernel without breaking the bonding equilibrium: an extension contract satisfies specified conditions on its read/write profile against kernel state. We state the conditions formally with composition semantics and prove that the conditions are sufficient. The <code>AttestationCoordinator</code> contract is the worked verification example, with the parametric kernel-immutability rules in <code>certora/AttestationCoordinator.spec</code> discharging the sufficient conditions.
                </PaperRun>
                <PaperRun title="Runtime composition.">
                    Above the protocol tier sits the runtime tier, where institutional assemblies, mechanism packages, service bindings, view definitions, and branding fields compose into rendered institutions that humans and agents interact with. We describe the seven-layer composition pipeline, the assembly registry pattern, the module system, the designer canvas, and the architectural separation between marketing surfaces and operational surfaces. The runtime is software architecture, not user-experience design; we treat it as a CS object.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>The bonded primitive&rsquo;s mechanism-design derivation and its formal verification are out of scope for the present paper. We summarize the kernel features the present paper relies on.</p>
                <PaperRun title="Kernel surface.">
                    Two state-changing operations: <code>commit</code> (dual-signed EIP-712 commitment, locks asymmetric bonds) and <code>resolveProcess</code> (buyer-only, atomic settlement of all orders in a process). Three storage mappings: <code>processes</code> (<code>ProcessState</code>), <code>orderStatus</code> (<code>uint8</code>), <code>orderProcessId</code> (<code>bytes32</code>).
                </PaperRun>
                <PaperRun title="Six invariants.">
                    (i) asymmetric bonding (buyer locks <Math>{"2P"}</Math>, seller locks <Math>{"2G"}</Math>); (ii) cumulative upstream bonding across <Math>{"N"}</Math>-party process chains; (iii) buyer dominance (only the root buyer can resolve); (iv) atomic resolution (all active orders settle simultaneously or not at all); (v) immutable evidence (commits and resolutions emit unmodifiable events); (vi) no escape hatches (no admin, no timeout, no governance, no unilateral exit).
                </PaperRun>
                <PaperRun title="Three tiers.">
                    <em>Kernel</em>: the irreducible settlement primitive. <em>Protocol</em>: the kernel together with extensions composed under the discipline of this paper. <em>Runtime</em>: the protocol together with semantic layers, builder surfaces, and rendered institutional shapes that humans and agents interact with. The present paper takes the three-tier distinction as given and develops the protocol and runtime tiers.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Protocol Extension Doctrine">
                <p>
                    The kernel is intentionally narrow. Its narrowness is what produces the bonding equilibrium; widening it would weaken the equilibrium. Extensions to the kernel therefore must add capability without widening the kernel itself. The doctrine answers the question of how this is done.
                </p>
                <PaperSubsection title="3.1 What the kernel secures">
                    <p>
                        At the kernel layer the protocol secures five things and only these: (i) process topology (which orders compose into which processes); (ii) economic obligations between counterparties (the bond posture at each order); (iii) role-bearing order nodes (who is the buyer and who is the seller at each order); (iv) lifecycle and settlement history (when each order was committed and resolved); (v) atomic process resolution semantics (the all-or-nothing settlement rule).
                    </p>
                    <p>
                        The kernel does not encode domain-specific meaning. A bonded commitment between a passenger and an airline, between a shipper and a forwarder, or between an agent and a service provider all reduce to the same kernel objects (an order with a seller, a buyer, a payment, and an agreement-hash). Domain meaning is added by extensions that attach typed information to the secured process graph.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.2 The anchored artifact pattern">
                    <p>The recurring structural shape of a Figaro extension is the <em>anchored artifact pattern</em>. An anchored artifact family exists when (1) multiple parties or tools must share a stable interpretation of some referenced artifact; (2) that interpretation must remain auditable over time; (3) the protocol needs a minimal on-chain reference point for that artifact family.</p>
                    <p>
                        The pattern then is: off-chain semantics (the document, the methodology, the field catalogue, the legal interpretation) plus an on-chain anchor for shared reference integrity. The anchor carries only what the chain needs to know to identify the artifact, verify that the off-chain document referenced is the one that was committed, and check that the artifact was admitted for use at the time of reference. The anchor does not carry the semantics themselves.
                    </p>
                    <FormalBlock label="Definition 3.1 (Anchor record).">
                        <p>
                            A protocol-layer anchor for an artifact family is a tuple <Math>{"\\langle \\text{clauseId}, \\text{version}, \\text{uriHash}, \\text{admitted} \\rangle"}</Math> where clauseId is the anchor identity, version is the version within the family, uriHash is an immutable cryptographic hash of the URI pointing at the off-chain content, and admitted is the binding&rsquo;s monotone admission flag (false until first registration, true thereafter; the discipline forbids deactivation). In the deployed implementation (<code>src/ClauseRegistry.sol</code>), the admission flag is stored as <code>mapping(bytes32 =&gt; bool) public registered</code>; version and uriHash live on the <code>ClauseRegistered</code> event log rather than as queryable storage. The conceptual anchor is reconstructed by reading the event log under the append-only-identity discipline of Section 4.2.
                        </p>
                    </FormalBlock>
                    <p>
                        The minimal-anchor surface is intentional. Larger anchors would freeze interpretive commitments into brittle on-chain state; smaller anchors would lose reference integrity. The four-field shape is the narrowest surface that supports cross-party agreement on which artifact is being referenced and which version of it.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.3 Per-instance payloads versus shared reference semantics">
                    <p>
                        The discipline turns on a distinction the doctrine makes load-bearing: the difference between <em>per-instance payloads</em> (the data attached to a particular order or process instance) and <em>shared reference semantics</em> (definitions whose meaning must remain stable across parties, tools, or time).
                    </p>
                    <p>
                        Per-instance payloads are operational data values: a specific delivery manifest, sealed address data, notes for a particular fulfilment event. These are typically private, mutable at the business level, or specific to one workflow instance. They do not deserve a protocol-level anchor. They live as instance data on the order or process that carries them. Shared reference semantics are definitions whose interpretation must remain stable across counterparties, tools, or time: a disclosure clause, a manifest clause family, a certification framework reference, a quality-assurance reference standard. These may justify a protocol-level anchor under the anchored artifact pattern.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.4 The decision rule">
                    <FormalBlock label="Proposition 3.2 (Decision rule for protocol extension).">
                        <p>A new domain feature belongs in the protocol if and only if all three of the following hold: (1) the feature attaches meaning to the secured process graph rather than to private instance data; (2) the feature requires stable shared interpretation across counterparties or tools; (3) the protocol needs to preserve that reference integrity over time. A feature satisfying all three conditions is a candidate for the anchored artifact pattern. A feature failing any of the three belongs in app logic, off-chain infrastructure, or per-instance payload handling.</p>
                    </FormalBlock>
                    <p>
                        The proposition is operationally checkable: each condition has a yes/no answer for a given proposed feature, and a feature that fails the check is not a protocol-extension candidate. The doctrine treats the rule as binding: the discipline is the willingness to keep features out of the protocol when the rule fails them, not just the willingness to add features when the rule passes them.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.5 Design guardrails">
                    <p>Four guardrails operationalize the rule:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        <li>Do not push app-specific workflow logic into the kernel. App logic that belongs to one institution does not belong to the protocol, regardless of how compelling the institution is.</li>
                        <li>Do not make the protocol so abstract that every document becomes a first-class ontology object. Bounded generality is the target; universal-ontology generality is a failure mode.</li>
                        <li>Do preserve reusable patterns when multiple domains clearly need the same coordination primitive. Generality earned by multiple domain instances is the kind of generality the protocol should accommodate.</li>
                        <li>Keep the protocol legible: process graph first, extension semantics second, app UX last. The order of legibility reflects the order of trust dependency.</li>
                    </ol>
                    <p>The guardrails do not contradict the decision rule; they are the operational restatement of it. A proposed extension that fails any guardrail typically also fails the decision rule, and vice versa.</p>
                </PaperSubsection>
                <PaperSubsection title="3.6 Bounded generality">
                    <p>
                        The discipline&rsquo;s central tension is between under- and over-generality. Under-generality produces one-off app-specific modules that cannot become reusable protocol concepts; the protocol fragments into incompatible bilateral arrangements. Over-generality produces a fake universal ontology, abstract registries disconnected from concrete coordination problems, and protocol bloat that mistakes possibility for scope; the protocol becomes a CS-academic exercise rather than working coordination infrastructure.
                    </p>
                    <p>
                        The right level of generality is generic enough to support reusable extension patterns but concrete enough to stay grounded in process coordination, obligations, and verifiable reference integrity. The test for this balance is not theoretical: a proposed extension is the right level of generality if at least two distinct domains have plausibly demonstrated need for the same coordination primitive, and the primitive can be specified narrowly enough to support both without becoming a universal-ontology object.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Clause Design as a CS Discipline">
                <p>
                    A Figaro clause is the concrete realization of an anchored artifact family. Designing a clause is the operational form of applying the extension doctrine. We treat the discipline in computer-science register: typed-data design, content-addressed extension, verification-stack architecture.
                </p>
                <PaperSubsection title="4.1 The four-layer verification stack">
                    <p>A protocol-tier clause is deployed across four coordinated layers that together discharge the clause&rsquo;s correctness.</p>
                    <PaperRun title="Layer A: client-side specification.">
                        A canonical JSON specification of the clause, parsed by a TypeScript meta-validator (a closed subset of JSON Schema covering string with specified format, integer, bigint as decimal string, boolean, enum, array, and object types with strict closed-clause rejection of unknown fields). The Layer A specification is the canonical declaration; everything below it is derived from it. Per-stage overrides express the staged-attestation pattern (an <code>applied</code>-stage attestation may carry different fields than an <code>inspected_intact</code>-stage attestation against the same clause). The specification also carries a <code>categories</code> array of short tags that runtime UIs use for discoverability and grouping; the tags are non-normative for validation but form the discoverability surface for a clause&rsquo;s runtime presentation.
                    </PaperRun>
                    <PaperRun title="Layer B: prover mirror (pending).">
                        A Rust implementation of the Layer A validator running in the SP1 zero-knowledge prover that produces verifiable attestation receipts during batched off-chain execution. The prover guest program mirrors the TypeScript validator byte-for-byte to enforce the clause during batched attestation execution. Layer B is currently deferred; the TypeScript validator (Layer A) plus the on-chain validator (Layer C) serve as the conformance specification for the eventual Rust port.
                    </PaperRun>
                    <PaperRun title="Layer C: on-chain validator.">
                        A Solidity contract implementing <code>IClauseValidator</code> that ABI-decodes the clause&rsquo;s content (no on-chain JSON parsing; the on-chain layer reads the canonical ABI encoding produced by Layer A&rsquo;s encoder) and reverts with typed custom errors on any violation. The validator is pure (no external state reads, no <code>block.*</code> or <code>tx.*</code>, no external calls) and binds to one clauseId via a compile-time literal (<code>{`bytes32 public constant override clauseId = keccak256("...")`}</code>); using a constructor-set <code>immutable</code> clauseId would forfeit the EVM-enforced determinism guarantee and is forbidden by the validator-contract pattern.
                    </PaperRun>
                    <PaperRun title="Runtime-tier UI binding.">
                        A frontend integration that consumes the Layer A specification — shaping clause-typed forms from the spec and validating the assembled agreement&rsquo;s content against it before either party signs (the same <code>validateContent</code> Layers B and C enforce) — then delivers the ABI-encoded content to the chain through the Layer C validator. The runtime tier is not strictly part of the verification stack, but it is part of the clause&rsquo;s deployment surface; an unintegrated clause exists on chain and not in any product.
                    </PaperRun>
                    <PaperRun title="Lockstep contract.">
                        A new clause is not done until all four layers ship in lockstep. If Layer A says one thing and Layer C says another, attestations silently divide into two interpretations and the clause&rsquo;s reference integrity collapses. The lockstep contract is operational discipline, not a formal soundness theorem: Layer A and Layer C agreement is enforced at the deploy-script level (the registration script registers the clauseId and binds the validator atomically) and at the test-suite level (Foundry tests in <code>test/clauseValidators/</code> cover well-formed input plus every typed-error revert path).
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.2 Append-only identity">
                    <p>Clause identity is append-only. The discipline produces three operational rules:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        <li>No in-place rewriting of clause meaning. A registered clause cannot be modified through any contract operation; the clause record at clauseId is immutable from the moment of registration.</li>
                        <li>No silent mutation of the content reference behind an existing identity. The <code>uriHash</code> field of the anchor is immutable; off-chain documents may be mirrored for availability but the canonical reference is the hash, not any URI.</li>
                        <li>New meaning requires a new version or a new clause identity. A clause family that needs a substantive change registers a new <code>clauseId</code> (e.g., <code>figaro-foo-v1</code> &rarr; <code>figaro-foo-v2</code>); never mutates the v1 contract or its Layer A spec.</li>
                    </ol>
                    <p>The append-only rule preserves historical interpretability: attestations filed under a clauseId remain readable against the exact clause anchor they were filed under, regardless of subsequent clause-family evolution.</p>
                </PaperSubsection>
                <PaperSubsection title="4.3 First-write-wins binding">
                    <p>
                        The validator-contract binding to a clauseId is permissionless and first-write-wins. <code>AttestationCoordinator.setValidator(clauseId, validator)</code> is callable by any address and binds the validator permanently for that clauseId. Subsequent calls revert with <code>ValidatorAlreadySet</code>. The first-write-wins discipline is deliberate: an admin-mediated binding would re-introduce governance authority over the clause-validation surface; a permissionless binding without first-write-wins would let any address overwrite an existing binding and break in-flight attestations. The combination is the only design that satisfies both no-admin and no-overwrite.
                    </p>
                    <PaperRemark title="Why first-write-wins is structurally necessary.">
                        Consider the alternatives. <em>Admin-mediated binding</em>: an admin can rotate validators, but admin authority over the validation surface re-introduces the discretionary actor the no-escape-hatches discipline rules out. <em>Mutable bindings</em>: any address can rewrite a binding, breaking existing attestations under that clauseId. <em>Time-locked bindings</em>: a delay buffers the overwrite, but any non-zero time creates a window in which the binding is uncertain. The first-write-wins rule produces a binding that is both permissionless and stable: anyone can set it once; no one can change it after.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="4.4 The atomic-bind pattern">
                    <p>
                        The first-write-wins rule produces a front-running window between <code>ClauseRegistry.registerClause</code> and <code>AttestationCoordinator.setValidator</code>. An adversary observing a pending registration can race to set a malicious validator under the new clauseId before the legitimate validator binds. The malicious validator self-attests as bound to the clauseId (satisfying the binding-integrity check) and then accepts content the legitimate validator would have rejected.
                    </p>
                    <p>
                        The mitigation is atomic registration: both writes execute in a single transaction. The 17 reference <code>figaro-*</code> validators are bound this way at genesis (the 18th catalogue clause, <code>figaro-topology-v1</code>, is manifest-only and has no on-chain validator), with <code>script/Deploy.s.sol</code> composing the calls in a single deployment broadcast session controlled by one signer (no third-party interleaving against the deployer&rsquo;s nonce stream). For third-party clauses registered post-deploy, the <code>ClauseRegistrationHelper</code> contract supplies genuine single-transaction atomicity as a stateless, no-admin, no-fee public helper:
                    </p>
                    <CodeBlock>{CODE_HELPER}</CodeBlock>
                    <p>
                        The helper composes the two underlying public calls (<code>ClauseRegistry.registerClause</code> and <code>AttestationCoordinator.setValidator</code>) atomically. The helper has no authority over either underlying contract; it has no admin, no fee, and no privilege. It is a permissionless composer that makes the two-step pattern safe.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.5 The 18-clause catalogue">
                    <p>The protocol currently ships eighteen clauses, treated as a coordinated reference set rather than as independent extensions.</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        {CATALOGUE.map(([id, desc]) => (
                            <li key={id}><code>{id}</code> &mdash; {desc}</li>
                        ))}
                    </ol>
                    <p>
                        The catalogue exhibits several patterns worth flagging. The <em>sister-clause pattern</em> (the five GHG disclosure clauses, the proximity policy/proof pair, the merchant/courier process clauses) supplies multiple specialized variants of a shared coordination concept; content shape is shared, clauseId is per-standard, and per-standard extensions can be added to a single sister without affecting siblings. The <em>committed-vs-runtime split</em> (proximity policy/proof, GHG disclosure/measurement) separates the band the parties commit at agreement signing (Category-2, byte-equality enforced) from the runtime witness data filed during execution (Category-1, fresh per attestation). The <em>manifest-only clause</em> pattern (<code>figaro-topology-v1</code>) represents a shared-vocabulary anchor whose enforcement is purely off-chain; parties commit to the topology at contract-signing time, the indexer reconstructs the DAG from event logs, and no runtime attestation fires. Each pattern is a discipline-level choice the catalogue&rsquo;s authors made deliberately, and each is reusable by future clauses in the family.
                    </p>
                    <PaperRun title="Class A and Class B records.">
                        A useful evidentiary taxonomy distinguishes records the kernel produces by construction from records participants attest under clause discipline. <em>Class A</em> records are kernel byproducts (commitment digest, bond deposits, cumulative-value accumulator state, order status transitions, resolution events): emitted by the kernel, clause-typed at the kernel level, discretion-free, and cryptographically authenticated. <em>Class B</em> records are discretionary clause-validated attestations (delivery confirmations, GHG disclosures, handoff attestations, custody-of-seal events, lifecycle stage transitions): produced by participants through the <code>AttestationCoordinator</code>, clause-typed at the <em>protocol</em> level, validator-gated, and substantively contestable on truth-of-content grounds. The clause-design discipline of this paper produces Class B records.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.6 What clause design is not">
                    <p>Three classes of would-be extension fall outside the discipline.</p>
                    <p>
                        <em>Per-instance payload clauses</em> that try to make every order-specific data shape into a registered clause. Most order-specific data does not need a registered clause; it needs an order-specific encoder and an off-chain decoder. The discipline applies the decision rule (Proposition 3.2) at the point of asking &ldquo;does this need stable shared interpretation across parties or tools?&rdquo; If the answer is no, the data is a payload, not a clause candidate.
                    </p>
                    <p>
                        <em>Clauses with mutable freeform text or large on-chain payloads</em> (typically larger than ~1KB). Mutable freeform text violates append-only identity. Large payloads violate the minimal-anchor surface. Both move the clause in the wrong direction.
                    </p>
                    <p>
                        <em>Clauses with admin, pause, or upgrade hooks.</em> The no-escape-hatches discipline applies to clauses as it applies to the kernel. A clause&rsquo;s validator is pure, immutable, and permissionless once bound; an admin-controlled validator re-introduces the discretionary actor.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. The Coordinator Pattern">
                <p>
                    We turn now to the second discipline question: under what conditions does an external mechanism contract compose with the kernel without breaking the bonding equilibrium? The discipline that answers this is the <em>coordinator pattern</em>: a set of sufficient conditions on an extension contract&rsquo;s read/write profile against kernel state under which the bonding equilibrium is preserved by composition. We state the conditions formally with composition semantics and prove that they are sufficient.
                </p>
                <PaperSubsection title="5.1 Composition semantics">
                    <p>
                        Let <Math>{"\\mathcal{K}"}</Math> denote the Figaro kernel as a state machine with state space <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math> (the values of the three storage mappings) and transition function <Math>{"\\delta_{\\mathcal{K}}"}</Math> restricted to the two operations <code>commit</code> and <code>resolveProcess</code>. Let <Math>{"\\mathcal{M}"}</Math> denote an external mechanism contract with state space <Math>{"\\mathcal{S}_{\\mathcal{M}}"}</Math> and transition function <Math>{"\\delta_{\\mathcal{M}}"}</Math>.
                    </p>
                    <FormalBlock label="Definition 5.1 (Composition).">
                        <p>
                            We extend the state space to include the kernel contract&rsquo;s ERC-20 token-balance position <Math>{"\\beta_{\\mathcal{K}}"}</Math> and the event log <Math>{"E_{\\mathcal{K}}"}</Math> alongside <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math> proper. The composition <Math>{"\\mathcal{K} \\otimes \\mathcal{M}"}</Math> is the joint state machine over the extended state space in which <Math>{"\\mathcal{M}"}</Math> may read from <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, <Math>{"\\beta_{\\mathcal{K}}"}</Math>, and <Math>{"E_{\\mathcal{K}}"}</Math> but may not write to any of them, and <Math>{"\\mathcal{K}"}</Math> neither reads from nor writes to <Math>{"\\mathcal{S}_{\\mathcal{M}}"}</Math>. The composition&rsquo;s transition function admits interleaving via the EVM call graph (an <Math>{"\\mathcal{M}"}</Math> transition&rsquo;s call frame may invoke <Math>{"\\mathcal{K}"}</Math>&rsquo;s public methods, but only subject to condition (i) of Proposition 5.2 below).
                        </p>
                    </FormalBlock>
                    <p>
                        The asymmetric read/write structure is the load-bearing constraint. <Math>{"\\mathcal{M}"}</Math> may consult kernel state to make its decisions, but <Math>{"\\mathcal{M}"}</Math> cannot modify kernel state. <Math>{"\\mathcal{K}"}</Math> does not need to know about <Math>{"\\mathcal{M}"}</Math> at all; the kernel is composition-blind. The extended state space is required to make the composition definition match the operational semantics of EVM contracts: invariants like cumulative upstream bonding involve <Math>{"\\beta_{\\mathcal{K}}"}</Math> (the kernel&rsquo;s escrow balance) as well as <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, and the immutable-evidence invariant is over <Math>{"E_{\\mathcal{K}}"}</Math> rather than purely over state mappings.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.2 The coordinator pattern, formally">
                    <FormalBlock label="Proposition 5.2 (Equilibrium-preserving composition).">
                        <p>The composition <Math>{"\\mathcal{K} \\otimes \\mathcal{M}"}</Math> preserves the kernel&rsquo;s bonding equilibrium if <Math>{"\\mathcal{M}"}</Math> satisfies all four of the following conditions:</p>
                        <ul className="space-y-1 list-none pl-0 text-sm">
                            <li>(i) <em>Read-only on kernel state.</em> No <Math>{"\\mathcal{M}"}</Math> operation can mutate kernel state: the call frame on which <Math>{"\\mathcal{M}.f"}</Math> executes does not invoke <code>commit</code> or <code>resolveProcess</code> in a way that produces unauthorized state mutation.</li>
                            <li>(ii) <em>No alternative settlement path.</em> <Math>{"\\mathcal{M}"}</Math> does not provide an operation that produces value flows equivalent to <code>resolveProcess</code> but bypasses it or modifies its preconditions.</li>
                            <li>(iii) <em>No discretionary lock-bypass.</em> <Math>{"\\mathcal{M}"}</Math> does not release bonded capital from <Math>{"\\mathcal{K}"}</Math>&rsquo;s escrow under conditions different from those <code>resolveProcess</code> enforces.</li>
                            <li>(iv) <em>Validator-gated content (where applicable).</em> If <Math>{"\\mathcal{M}"}</Math> accepts content typed by a registered clauseId, it routes the content through the registered <code>IClauseValidator</code> before accepting it; content typed by a clauseId without a registered validator is rejected.</li>
                        </ul>
                    </FormalBlock>
                    <p>
                        Each condition preserves a subset of the kernel&rsquo;s claims: condition (i) preserves the kernel state predicates the verification stack establishes (status monotonicity, transition correctness, cumulative integrity); condition (ii) preserves buyer dominance; condition (iii) preserves the no-escape-hatches discipline; condition (iv) preserves the clause-validation surface. A mechanism that satisfies all four can be composed onto the kernel with the kernel&rsquo;s equilibrium guarantees still in force.
                    </p>
                    <PaperRun title="Proof sketch.">
                        The kernel&rsquo;s bonding equilibrium rests on the six invariants of Section 2; each condition maps to preservation of a subset under composition. Condition (i) preserves invariants (i)&ndash;(v): if <Math>{"P : \\mathcal{S}_{\\mathcal{K}} \\to \\mathrm{Bool}"}</Math> is invariant under <Math>{"\\delta_{\\mathcal{K}}"}</Math> and <Math>{"\\delta_{\\mathcal{M}}"}</Math> does not change <Math>{"\\mathcal{S}_{\\mathcal{K}}"}</Math>, then <Math>{"P"}</Math> is invariant under <Math>{"\\delta_{\\mathcal{K} \\otimes \\mathcal{M}}"}</Math>, the disjoint union of the two transition functions. Condition (ii) preserves buyer dominance and atomic resolution by ruling out alternative paths that would bypass them &mdash; an alternative settlement path is exactly the escape hatch the escape-hatch-weakness theorem forbids. Condition (iii) preserves no-escape-hatches by ruling out lock-bypass. Condition (iv) preserves the clause-validation surface: a mechanism accepting unvalidated content under a clauseId creates a content surface downstream consumers cannot trust. The four are jointly sufficient, and necessary in the worst case &mdash; relaxing any one produces a documented anti-pattern (direct kernel-state mutation; an alternative settlement path; a discretionary lock-bypass; unvalidated clause-typed content). We do not claim necessity in every model; weaker conditions on a sufficiently restricted mechanism (e.g., a pure view contract) might suffice for narrower preservation claims.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="5.3 The AttestationCoordinator as worked example">
                    <p>
                        The <code>AttestationCoordinator</code> contract is the canonical worked example of the coordinator pattern. It accepts attestations against bonded orders, gates them through registered <code>IClauseValidator</code> contracts, and emits typed events without ever modifying kernel state. A second admission gate enforces a Merkle-inclusion proof against the order&rsquo;s signed <code>agreementHash</code>: only clauses committed at contract-signing time can be attested under, so a clause that was not part of the bilateral agreement cannot land an attestation against the order. The contract&rsquo;s verification surface discharges Proposition 5.2&rsquo;s conditions explicitly.
                    </p>
                    <p>
                        The Certora specification <code>certora/AttestationCoordinator.spec</code> contains seven declared CVL rules. Two are parametric over every public function on <code>AttestationCoordinator</code> and are the direct discharge of condition (i): <code>attestationCannotChangeOrderStatus</code> and <code>attestationCannotChangeProcessState</code>. Each rule is universally quantified over methods on the contract: for any public function and any kernel-state value before and after its execution, the kernel state is unchanged. Conditions (ii) and (iii) are discharged by construction: the contract has no operation that transfers tokens from the kernel&rsquo;s escrow and no operation that calls <code>resolveProcess</code> or any kernel state-changing function. Condition (iv) is discharged by the <code>noValidatorBlocksBuyerAttestation</code> CVL rule, which proves that any attestation under a clauseId with no registered validator reverts. The four conditions thus reduce to verification-stack requirements a candidate coordinator can be checked against mechanically.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.4 What the pattern is not">
                    <p>
                        The pattern is not a generic external-call disclaimer. A mechanism that calls into the kernel&rsquo;s view functions, reads state, and returns derived values is composition-safe; a mechanism that calls into the kernel&rsquo;s state-changing functions on behalf of a third party may or may not be composition-safe, depending on whether the third-party authorization is properly delegated. The <code>IRoleResolver</code> interface supplies the authorization-delegation pattern for the latter case (a role-based attestation routed through a mechanism that consults the role-resolver to authorize the caller).
                    </p>
                    <p>
                        The pattern is also not a substitute for the clause-validation discipline. A mechanism that accepts clause-typed content must route it through the registered validator; a mechanism that produces clause-typed events must produce content the registered validator would have accepted. The two disciplines (coordinator pattern and clause design) are independent and both must be satisfied for an extension to be protocol-grade.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Runtime Composition">
                <p>
                    We turn now to the runtime tier: the layer above the protocol where institutional shapes are composed and rendered. The runtime tier is not part of the protocol&rsquo;s verification surface (it does not affect kernel state and does not change the equilibrium), but it is part of the protocol&rsquo;s deployment surface (without a runtime, the protocol has no users, only contracts). The discipline at the runtime tier is software architecture: how to compose institutional shapes from reusable parts without re-implementing the protocol per deployment.
                </p>
                <PaperSubsection title="6.1 Seven-layer composition pipeline">
                    <p>The runtime composes institutional surfaces through seven layers.</p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Protocol truth.</strong> Contract reads, event subscriptions, and the cumulative state derived from them. This layer is authoritative; nothing above it can override it.</li>
                        <li><strong>Semantic derivation.</strong> The derivation of role contexts, capability bindings, mechanism trust boundaries, and guarantee/risk objects from protocol state. This layer is also authoritative: a runtime that renders a role the semantic layer has not derived is rendering a role that is not in the protocol.</li>
                        <li><strong>Institution assembly.</strong> The structural declaration of an institutional shape: which roles compose, which mechanisms are bound, which views are exposed. The assembly is the runtime&rsquo;s canonical document.</li>
                        <li><strong>Mechanism packages.</strong> Reusable units that own a mechanism&rsquo;s contract bindings, semantic adapters, capability mappings, default modules, and guarantee/risk copy. An assembly references packages rather than individual modules.</li>
                        <li><strong>Service bindings.</strong> Off-chain or hybrid infrastructure bindings: identity resolution, catalogue metadata, discovery and search, messaging and handoff, evidence transport, geospatial filtering. The bindings are resolved through stable interfaces, not hardwired per institution.</li>
                        <li><strong>View definitions.</strong> Per-surface UI composition: route or surface id, accepted context, visible slots, module ordering, role-specific visibility.</li>
                        <li><strong>Branding fields.</strong> Presentation-only personalization: theme tokens, imagery, type and spacing preferences, non-semantic copy. In the current implementation these are lightweight fields on the seller profile referenced at binding time (accent colour, logo, hero image, theme class, via the seller&rsquo;s branding metadata) rather than a heavyweight separate pipeline stage; we list them as a distinct layer because they sit at a distinct trust boundary (presentation-only, never semantic), not because they require their own composition machinery. Branding fields cannot alter capability validity, mechanism authority, risk boundaries, or settlement semantics.</li>
                    </ol>
                    <p>
                        The pipeline is layered: each layer consumes the layers below it and produces output the layers above it consume. The structural property the discipline enforces is that institution-specific mutation lives in layers 3 through 7; the bottom two layers are runtime authority and not institution-overridable.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.2 Assembly registry pattern">
                    <p>
                        An institution assembly is a JSON document declaring the institutional shape: roles, mechanism packages, view definitions, module placements, narrative defaults. The assembly is the runtime&rsquo;s structural primary; the rest of the pipeline is derived from it. The assembly registry pattern handles four operations: <em>discovery</em> (which assemblies exist for a given role, region, or institutional pattern); <em>parsing</em> (validating the assembly&rsquo;s JSON against the runtime&rsquo;s clause for institutional shape); <em>validation</em> (cross-checking that referenced mechanism packages exist, that view definitions reference valid modules, and that role mappings are coherent); and <em>publication</em> (making a new assembly available, content-addressed for interoperability).
                    </p>
                    <p>
                        The pattern is implemented in <code>frontend/lib/mechanisms/useAssemblyRegistry.ts</code>, which consolidates discovery and indexing (event-derived from <code>AssemblyRegistered</code> logs), manifest building and canonicalization, and IPFS-pinned publication through the <code>AssemblyRegistry</code> contract; fork-and-draft helpers live in <code>frontend/lib/designer/</code>. The runtime carries six labelled assembly slugs (the slug-to-label taxonomy in <code>frontend/lib/shared/assemblyLabels.ts</code>): <code>local-commerce-seller-assigned</code>, <code>direct-sale</code> (a buyer-to-merchant single-leg arrangement), <code>figaro-equipment-rental</code>, <code>figaro-freelance</code>, <code>figaro-procurement</code>, and <code>figaro-disclosure-review</code>. Published assemblies are otherwise event-derived on chain rather than bundled; the on-disk manifest fixtures are a scenario-keyed subset (local-commerce and its fulfilment variants, direct-sale, kit-assembly) used to exercise the format end-to-end.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.3 Module system">
                    <p>
                        Modules are the unit the assembly&rsquo;s view definitions place in the rendered surface. A module owns a UI component, a set of typed actions it can dispatch, and the semantic context it consumes. The module registry directory (<code>frontend/components/modules/</code>) is the registry location; in the current implementation it is lightly populated (the seller-branding module), with the broader module-shaped concerns &mdash; catalogue editing, cart composition, order creation, attestation submission, delivery coordination, GHG disclosure, FIG token operations &mdash; realized across <code>frontend/lib/</code> and the component tree rather than consolidated under a single registry. The module pattern below is the composition discipline those surfaces follow, whether or not they are registered under <code>modules/</code>.
                    </p>
                    <p>
                        The module system has a structural property worth flagging: a module is composition-safe if and only if its dispatched actions go through the typed action model (rather than producing direct contract calls) and its semantic context comes from the semantic derivation layer (rather than from local state hardcoded into the module). The discipline matches the coordinator pattern&rsquo;s separation of concerns at the runtime tier: the protocol-tier coordinator pattern says external mechanisms read kernel state and emit events without writing to the kernel; the runtime-tier module discipline says modules read semantic state and dispatch typed actions without writing to the runtime&rsquo;s authoritative layers.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.4 The lens system">
                    <p>
                        A particular runtime-tier construct worth treating separately is the <em>lens</em> pattern: a typed context object that a module receives and that exposes a constrained subset of the runtime&rsquo;s full state. A buyer-side module receives the buyer&rsquo;s lens onto the process; a seller-side module receives the seller&rsquo;s lens; an auditor&rsquo;s module receives the auditor&rsquo;s lens. Each lens exposes only what its role context licenses; the module cannot reach beyond the lens to access other roles&rsquo; state.
                    </p>
                    <p>
                        The lens pattern is the runtime&rsquo;s enforcement of the role-segregation that the kernel enforces at the bonding-and-resolution surface. The kernel&rsquo;s role-segregation is mathematical (only the buyer can call <code>resolveProcess</code>); the runtime&rsquo;s is operational (only a buyer-context module can dispatch buyer-side actions). The two reinforce each other: a runtime that exposed seller-side state to a buyer-context module would let the buyer attempt to submit attestations as the seller, which the kernel would reject at signature verification but which the runtime should not have attempted in the first place.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.5 The designer canvas">
                    <p>
                        A specialized runtime surface deserves separate treatment: the assembly designer (<code>DesignerCanvas</code>, which wraps the <code>ProcessGraphCanvas</code> DAG renderer for topology and the <code>AgreementDrawer</code> for per-node clause binding, at <code>/builders/designer/new</code> and <code>/builders/designer/edit/[slug]</code>). The designer is a composition surface where assembly authors fork an existing reference assembly or start from blank, modify the bonded-process graph, bind clauses to per-node clauses through a side drawer, and save drafts.
                    </p>
                    <p>
                        The canvas is not a wizard, not a recommendation engine, not a generative-AI interface; it is a structural editor for assemblies. The designer pulls the runtime&rsquo;s primitives (<code>figaro-commerce-v1</code> commitments, <code>figaro-proximity-proof-v1</code> handoff attestations, <code>figaro-fulfilment-v2</code> clauses, etc.) onto the canvas as draggable elements; the author composes them into the shape the institutional context requires; the resulting assembly is saved as a draft.
                    </p>
                    <p>
                        The discipline the canvas enforces is structural: an assembly that violates the runtime&rsquo;s composition rules cannot be saved. A fan-out node where one fan-out lacks a corresponding mechanism package is flagged; an attestation node referencing an unbound clauseId is flagged; structural composition failures (mismatched mechanism packages, dangling sub-orders, topology shapes the runtime does not admit) are surfaced before the draft can be persisted. The canvas surfaces the discipline rather than hiding it; an author who saves an assembly through the canvas has by construction produced one that satisfies the runtime&rsquo;s structural integrity.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.6 The (marketing) / (app) split">
                    <p>
                        A practical runtime-architecture choice worth naming: the frontend separates routes into two top-level groups, <code>frontend/app/(marketing)/</code> for publication-and-explanation surfaces and <code>frontend/app/(app)/</code> for transactional surfaces. The split has three structural properties.
                    </p>
                    <p>
                        <em>No wallet provider in marketing routes.</em> A user who has never connected a wallet must be able to read every marketing route. The <code>(marketing)</code> group does not load the wallet provider; the <code>(app)</code> group does. <em>Wallet-connect is signing prerequisite, not login.</em> <code>(app)</code> routes mount the wallet provider but do not gate read-only content behind connection state. Inline write affordances use the canonical <code>WalletGate</code> wrapper to require connection at the moment of signing rather than at route entry. <em>Two distinct headers.</em> The marketing header carries marketing nav (Discover, About, Cryptoeconomics); the (app) header carries protocol-surface nav (Connect Wallet, Inbox, Orders). The two are not collapsed.
                    </p>
                    <p>
                        The split&rsquo;s structural property is that a reader of the publication content is not asked to connect a wallet to read; a participant&rsquo;s transactional surface is wallet-gated by structural design rather than by per-page logic. The architectural separation matches the trust-tier separation of the underlying protocol: marketing is untrusted publication, (app) is signing-required interaction, and the route architecture reflects the trust layers rather than collapsing them into one shell.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. What the Discipline Refuses">
                <p>The discipline is more visible in what it refuses than in what it admits. We catalogue the recurring failure modes the discipline prevents.</p>
                <PaperRun title="Kernel changes.">
                    The kernel is frozen. Any proposed extension that requires a kernel change is, by the discipline, not a candidate extension; it is a proposal for a different protocol. The escape-hatch-weakness theorem makes this a mathematical necessity, not a stylistic preference: any unilateral exit path from the bonded state weakens the Nash equilibrium. The protocol&rsquo;s narrowness is its security property.
                </PaperRun>
                <PaperRun title="Admin paths.">
                    Any proposed extension that introduces admin authority over clause binding, validator selection, mechanism activation, or kernel state is refused. The first-write-wins binding pattern is the specific implementation of the no-admin discipline at the clause-validation surface; analogous patterns apply elsewhere (e.g., the <code>SellerRegistry</code>&rsquo;s permissionless registration without admin gating).
                </PaperRun>
                <PaperRun title="Force-majeure escape clauses.">
                    Any proposed extension that lets a participant avoid bond loss in external events (weather, regulatory action, force majeure) is refused. The structural answer is composition with parallel insurance processes: the participant buys insurance from an external insurer naming themselves as beneficiary, and the insurance settlement is independent of the bonded commitment. Bonded settlement does not contemplate external-event-conditional release; insurance does. The two compose; neither replaces the other.
                </PaperRun>
                <PaperRun title="Multi-currency cross-leg coordination.">
                    Any proposed extension that lets a process chain denominate different legs in different currencies is refused. Multi-currency coordination requires an external rate of substitution (oracle, DEX, pre-agreed FX rate) that re-introduces a discretionary actor and breaks the same-unit comparability on which the <Math>{"2\\times"}</Math> Nash-stability result rests. Multi-currency coordination at the participant level is achieved through wallet-side swaps before commitment; the kernel sees one currency per process.
                </PaperRun>
                <PaperRun title="Clauses with mutable freeform text.">
                    Any proposed clause with large-text or mutable-text fields is refused. The minimal-anchor surface and append-only identity together rule out anchoring substantial mutable content on chain. Such content belongs off-chain, content-addressed by hash with the hash registered as the clause&rsquo;s reference.
                </PaperRun>
                <PaperRun title="Modules with direct contract calls.">
                    Any runtime-tier module that bypasses the typed action model and produces direct contract calls is refused. The action model&rsquo;s discipline is what makes the runtime&rsquo;s compositional safety analyzable; a module that escapes the discipline can produce state changes the runtime&rsquo;s other layers do not know about.
                </PaperRun>
                <PaperRun title="Branding that alters semantics.">
                    Any branding field that affects capability validity, mechanism authority, risk boundaries, or settlement semantics is refused. Branding is presentation-only; an institution that wants different semantics writes a different assembly, not different branding.
                </PaperRun>
                <PaperRun title="Soulbound reputation as protocol primitive.">
                    Any proposed extension that introduces a non-transferable reputation token bound to a wallet at the protocol layer is refused. Reputation is a graph-tier signal, not a kernel-tier construct; introducing soulbound reputation at the protocol layer reifies what is appropriately a graph-level pattern (settlement history is already on chain and readable as reputation by any party who wants to read it that way) into a privileged-credential construct that weakens the kernel&rsquo;s actor-neutrality property.
                </PaperRun>
                <PaperRun title="Fee discounts conditioned on protocol-tier signals.">
                    Any proposed extension that conditions kernel-tier or protocol-tier behavior on a fee discount, a green-bond adjustment, or any other rate-modifying signal is refused. The <Math>{"2\\times"}</Math> bonding ratio is the minimum viable equilibrium under the minimum-multiplier result; introducing a fee-discount mechanism that modifies the effective ratio for some class of participant breaks the equilibrium for that class. Whatever incentive a fee discount would supply belongs at the assembly or seller-registry tier as a parameter the parties choose, not at the bonding rule.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    Above the kernel sits a protocol layer (extensions under the doctrine, clause discipline, and coordinator pattern of Sections 3&ndash;5) and a runtime layer (institutional shapes composed under the discipline of Section 6). Both layers are research objects in computer-science register, and both have a discipline derived from the kernel&rsquo;s security requirements rather than from convenience or developer ergonomics.
                </p>
                <p>
                    The protocol-extension doctrine produces a decision rule (Proposition 3.2) for whether a proposed feature belongs in the protocol; clause design as a CS discipline produces a four-layer verification stack with append-only identity and first-write-wins binding; the coordinator pattern produces formal sufficient conditions (Proposition 5.2) for equilibrium-preserving composition. Each is a contract the discipline holds extension authors to; together they make extension to the kernel a rigorous engineering practice rather than an opinion-driven one.
                </p>
                <p>
                    The runtime-tier composition produces a seven-layer pipeline (from protocol truth to branding fields), an assembly registry pattern, a module system constrained by the typed action model, a lens system enforcing role-context separation, a designer canvas surfacing discipline at authoring time, and a route-architecture split between marketing and transactional surfaces. The runtime tier is not verified the way the protocol tier is, but its discipline is operationally checkable, and the open question is whether formal verification at the runtime tier is worth the work.
                </p>
                <p>
                    The contribution is the discipline itself, made explicit and research-grade: how the kernel becomes a protocol becomes a runtime, with the discipline at each layer specified well enough that an extension author or runtime architect can apply it.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
