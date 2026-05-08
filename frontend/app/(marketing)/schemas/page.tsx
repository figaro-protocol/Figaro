import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Schemas — Figaro Protocol",
    description: "The schema architecture: client TypeScript + on-chain Solidity validators (with an SP1 Rust mirror pending) parsing one canonical JSON spec. Eighteen reference schemas in force.",
};

interface SchemaRow {
    id: string;
    description: string;
}

const SCHEMA_FAMILIES: { name: string; rows: SchemaRow[] }[] = [
    {
        name: "Manifest",
        rows: [
            {
                id: "figaro-topology-v1",
                description:
                    "DAG lineage (parent order hashes) for multi-party process trees. Manifest-only; no on-chain validator.",
            },
        ],
    },
    {
        name: "Commerce primitives",
        rows: [
            {
                id: "figaro-handoff-v1",
                description:
                    "Physical-exchange mode: face-to-face / dead-drop / parking-area / locker / courier-relay.",
            },
            {
                id: "figaro-commerce-v1",
                description: "Currency, payment, line items, quantity, per-item identifiers.",
            },
            {
                id: "figaro-geo-v1",
                description: "Origin and destination geohashes at configurable precision.",
            },
            {
                id: "figaro-fulfilment-v1",
                description:
                    "Fulfilment method — single canonical enum capturing modality (consume-onsite / pickup / deliver) and who-organizes-the-fulfiller (buyer-assigned / seller-assigned / dutch-auction).",
            },
        ],
    },
    {
        name: "GHG family",
        rows: [
            {
                id: "figaro-ghg-protocol-v1",
                description: "GHG Protocol Corporate Standard + scope (Category-2) — committed at contract time.",
            },
            {
                id: "figaro-ghg-iso-14064-v1",
                description: "ISO 14064 family + scope (Category-2) — committed at contract time.",
            },
            {
                id: "figaro-ghg-pas-2050-v1",
                description: "PAS 2050 product carbon footprint + scope (Category-2) — committed at contract time.",
            },
            {
                id: "figaro-ghg-en-16258-v1",
                description: "EN 16258 transport-emissions methodology + scope (Category-2) — committed at contract time.",
            },
            {
                id: "figaro-ghg-custom-v1",
                description: "Custom or non-standard GHG methodology + scope (Category-2) — committed at contract time.",
            },
            {
                id: "figaro-ghg-measurement-v1",
                description: "Runtime grams CO2e per fulfilment (Category-1) — estimate / measured / restated / verified.",
            },
        ],
    },
    {
        name: "Lifecycle and proximity",
        rows: [
            {
                id: "figaro-delivery-lifecycle-v1",
                description: "Stage progression: prep → ready → en-route → picked-up → delivered.",
            },
            {
                id: "figaro-proximity-policy-v1",
                description:
                    "Required detection band committed at agreement signing (Category-2). Sister of figaro-proximity-proof-v1.",
            },
            {
                id: "figaro-proximity-proof-v1",
                description:
                    "Per-handoff nonce + signed witness payload at runtime (Category-1). Off-chain consumers verify proof.band == policy.band.",
            },
        ],
    },
    {
        name: "Sovereign process logs",
        rows: [
            {
                id: "figaro-merchant-process-v1",
                description:
                    "Merchant-side lifecycle (sovereign log; generic across local-commerce verticals): received → accepted → prep → ready → handed-off.",
            },
            {
                id: "figaro-courier-process-v1",
                description:
                    "Courier-side lifecycle (sovereign log; generic across transport modes): available → accepted → en-route → arrived → in-transit → completed.",
            },
        ],
    },
    {
        name: "Legal anchoring",
        rows: [
            {
                id: "figaro-jurisdiction-v1",
                description:
                    "Off-chain dispute-resolution jurisdiction (applicable law + forum + language) — baseline graph per Paper E.",
            },
            {
                id: "figaro-consent-v1",
                description:
                    "Cryptographic consent attestation: a wallet binds itself to an off-chain legal document via its keccak256 hash, version, and title. Append-only.",
            },
        ],
    },
];

function SchemaListItem({ row }: { row: SchemaRow }) {
    return (
        <li
            id={`schema-${row.id}`}
            className="flex flex-col sm:flex-row gap-1 sm:gap-3 scroll-mt-24"
        >
            <span className="font-mono text-xs text-ink-muted sm:w-56 sm:shrink-0">
                {row.id}
            </span>
            <span className="text-sm text-ink-body">{row.description}</span>
        </li>
    );
}

export default function Schemas() {
    return (
        <>
            <MarketingHero
                title="Three layers of validation."
                lead={
                    <>
                        A schema in Figaro is the on-chain content type of an attestation &mdash; a structured piece of evidence emitted during the lifecycle of a bonded process. Every attestation under a registered <code>schemaId</code> is validated identically by client TypeScript and on-chain Solidity (with an SP1 Rust mirror pending). Eighteen reference schemas ship today; new schemas register permissionlessly.
                    </>
                }
            />

            <MarketingSection eyebrow="How it works" title="One spec. Three validators. Enforced in lockstep.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    Every registered schema is enforced at three layers. A new schema is not &ldquo;done&rdquo; until all required layers ship together:
                </p>
                <ul className="space-y-4 text-sm text-ink-body leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-20 shrink-0 uppercase">Layer A</span>
                        <span><strong>Client-side (TypeScript).</strong> The SDK&apos;s <code>parseSchemaSpec</code> and <code>validateContent</code> check that off-chain content conforms to the spec before anyone signs it. Closed subset of JSON Schema with domain types (hex bytes, addresses, ISO datetimes, enums). Catches form errors before they reach chain.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-20 shrink-0 uppercase">Layer B</span>
                        <span><strong>Prover (Rust, deferred).</strong> A byte-for-byte mirror of the Layer A validator, compiled into the SP1 prover for batched attestation verification. Not yet live; the TypeScript validator is the conformance spec for the Rust port.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-ink-muted mt-1 w-20 shrink-0 uppercase">Layer C</span>
                        <span><strong>On-chain (Solidity).</strong> The schemaId binds to an <code>ISchemaValidator</code> contract. The attestation coordinator calls it on every attestation; malformed content reverts with a typed custom error. First-write-wins and immutable &mdash; once bound to a schemaId, the validator address cannot be changed.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-ink-body leading-relaxed">
                    All layers parse the same canonical JSON spec and apply the same validation rules. The cross-layer consistency is the discipline; today it&apos;s enforced between Layer A and Layer C, with Layer B closing the loop when shipped. Bytes that Layer A rejects will also be rejected by Layer C.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Shipped schemas" title="Eighteen schemas, six families.">
                <p className="text-sm text-ink-body leading-relaxed mb-6">
                    The reference set covers manifest topology, commerce primitives, GHG disclosure and measurement, lifecycle and proximity, sovereign process logs, and legal anchoring. The full layer-status detail (which validators are deployed under each schemaId) lives on{" "}
                    <Link href="/spec" className="underline">/spec</Link>.
                </p>
                <div className="space-y-8">
                    {SCHEMA_FAMILIES.map((family) => (
                        <div key={family.name}>
                            <p className="text-eyebrow uppercase text-ink-muted mb-3">
                                {family.name}
                            </p>
                            <ul className="space-y-3">
                                {family.rows.map((row) => (
                                    <SchemaListItem key={row.id} row={row} />
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </MarketingSection>

            <MarketingSection eyebrow="Adding a schema" title="The nine-step checklist.">
                <ol className="space-y-3 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                    <li>Write the JSON spec at <code>sdk/src/schemas/examples/&lt;your-schema&gt;.json</code>.</li>
                    <li>Mirror it in <code>frontend/lib/shared/schemas/&lt;your-schema&gt;.json</code> so the UI can preload it.</li>
                    <li>Write the SDK content encoder in <code>sdk/src/schemas/encode.ts</code> and export from <code>index.ts</code>.</li>
                    <li>Add a conformance test in <code>sdk/tests/schemas/examples.test.ts</code>.</li>
                    <li>Write the Solidity validator at <code>src/schemaValidators/Foo&lt;Schema&gt;V1Validator.sol</code> &mdash; ABI-decode content, revert with typed custom errors.</li>
                    <li>Write Foundry tests at <code>test/schemaValidators/</code> covering happy paths and every typed revert.</li>
                    <li>Mirror the validator in the Rust prover when Layer B is live (deferred).</li>
                    <li>List the schema on the <Link href="/spec" className="underline">/spec</Link> &ldquo;Schema validators in force&rdquo; section.</li>
                    <li>
                        Wire <code>setValidator(schemaId, validator)</code> into <code>script/Deploy.s.sol</code> and <code>script/DeployMainnet.s.sol</code>; add a regression test in <code>test/DeployScriptTest.t.sol</code>. <strong>For third-party schemas registered post-deploy, use{" "}
                        <code>SchemaRegistrationHelper.registerSchemaAndValidator(...)</code></strong>{" "}
                        instead &mdash; atomic register+bind in one transaction; closes the front-running window between separate <code>registerSchema</code> and <code>setValidator</code> calls.
                    </li>
                </ol>
                <p className="mt-6 text-sm text-ink-muted leading-relaxed">
                    Skipping any step produces one of two failure modes: Layer A silently accepts content the on-chain validator would reject (spec drift), or Layer C rejects everything under the schemaId (missing registration). Lockstep is the invariant that makes the pattern worth using.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Where to look" bottomPad="extra">
                <ul className="space-y-3 text-sm text-ink-body leading-relaxed">
                    <li><strong>SDK module:</strong> <code>@figaro/core/schemas</code> &mdash; meta-schema validator, <code>validateContent</code>, per-schema encoders. The canonical source of the spec format. See <Link href="/integrate" className="underline">Integrate</Link>.</li>
                    <li><strong>On-chain interface:</strong> <code>src/ISchemaValidator.sol</code> &mdash; the two-method interface every on-chain validator implements. Contract catalogue at <Link href="/spec" className="underline">/spec</Link>.</li>
                    <li><strong>Registration path:</strong> <code>AttestationCoordinator.setValidator(schemaId, validator)</code> &mdash; permissionless, first-write-wins, immutable once set. Atomic register+bind via <code>SchemaRegistrationHelper.registerSchemaAndValidator(...)</code>.</li>
                    <li><strong>Kernel side:</strong> attestation receipts are bound to the signed <code>agreementHash</code> via merkle inclusion proof; the rationale is on <Link href="/protocol" className="underline">Protocol</Link>.</li>
                    <li><strong>Academic frame:</strong> Paper E (jurisdiction baseline) and the Philosophy / Law / Ethics discipline on <Link href="/cryptoeconomics" className="underline">Cryptoeconomics</Link>.</li>
                    <li><strong>Repository:</strong> <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="underline">github.com/figaro-protocol/Figaro-Prototype2</a>. The <code>CLAUDE.md</code> at the root is the authoritative inventory; the &ldquo;Adding a new schema&rdquo; checklist above mirrors the one there.</li>
                </ul>
                <p className="mt-6 text-sm text-ink-muted">
                    Composition tools and the assembly designer: <Link href="/builders" className="underline">/builders</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
