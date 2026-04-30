import Link from "next/link";

export default function Schemas() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    For schema designers
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Anchor your domain&apos;s content type once.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Every counterparty commits to it. Every validator &mdash; client, prover, chain &mdash; enforces it identically. Write the spec, register the validator, and your domain becomes a first-class attestation type that any Figaro assembly can reference.
                </p>
            </section>

            {/* Who this is for */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Who this is for
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Standards bodies. Domain methodologists. Legal-form publishers.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    A schema in Figaro is the on-chain content type of an attestation &mdash; a structured piece of evidence that gets emitted during the lifecycle of a bonded process. Eighteen reference schemas ship today: topology (manifest-only), handoff, commerce, geo, fulfilment, the five GHG disclosure sister schemas (Protocol, ISO 14064, PAS 2050, EN 16258, custom), GHG measurement, delivery lifecycle, the proximity policy/proof sister schemas, merchant process, courier process, jurisdiction, consent.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                    If you are the author of a domain standard or a domain-specific data model &mdash; a GHG scope definition, a bill-of-lading format, a proof-of-origin schema, a professional-licensure attestation, a voluntary-carbon-market methodology &mdash; you can anchor it as a Figaro schema and have it enforced identically by every party who touches it. The protocol replaces three separate validation efforts (your form, their form, the aggregator&apos;s form) with one.
                </p>
            </section>

            {/* Three-layer validator */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    How it works
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    One spec. Three validators. Enforced in lockstep.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-6">
                    Every registered schema is enforced at three layers. A new schema is not &ldquo;done&rdquo; until all three ship together:
                </p>
                <ul className="space-y-4 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-20 shrink-0 uppercase">Layer A</span>
                        <span><strong>Client-side (TypeScript).</strong> The SDK&apos;s <code>parseSchemaSpec</code> and <code>validateContent</code> check that off-chain content conforms to the spec before anyone signs it. Closed subset of JSON Schema with domain types (hex bytes, addresses, ISO datetimes, enums). Catches form errors before they reach chain.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-20 shrink-0 uppercase">Layer B</span>
                        <span><strong>Prover (Rust, deferred).</strong> A byte-for-byte mirror of the Layer A validator, compiled into the SP1 prover for batched attestation verification. Not yet live; the TypeScript validator is the conformance spec for the Rust port.</span>
                    </li>
                    <li className="flex gap-4">
                        <span className="font-mono text-xs text-gray-400 mt-1 w-20 shrink-0 uppercase">Layer C</span>
                        <span><strong>On-chain (Solidity).</strong> Your schema binds to an <code>ISchemaValidator</code> contract. The attestation coordinator calls it on every attestation; malformed content reverts with a typed custom error. First-write-wins and immutable &mdash; once bound to a schemaId, the validator address cannot be changed.</span>
                    </li>
                </ul>
                <p className="mt-6 text-sm text-gray-700 leading-relaxed">
                    All three layers parse the same canonical JSON spec and apply the same validation rules. A content blob that Layer A rejects will also be rejected by Layer C. The three-way consistency is the guarantee that makes schema content reliable downstream.
                </p>
            </section>

            {/* Shipped schemas */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Shipped schemas
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Eighteen reference schemas. Each is a working example of the pattern.
                </h2>
                <ul className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-topology-v1</span><span>DAG lineage (parent order hashes) for multi-party process trees.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-handoff-v1</span><span>Physical-exchange mode: face-to-face / dead-drop / parking-area / locker / courier-relay.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-commerce-v1</span><span>Currency, payment, line items, quantity, per-item identifiers.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-geo-v1</span><span>Origin and destination geohashes at configurable precision.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-fulfilment-v1</span><span>Fulfilment method — single canonical enum capturing modality (consume-onsite / pickup / deliver) and who-organizes-the-fulfiller (buyer-assigned / seller-assigned / dutch-auction).</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-ghg-protocol-v1</span><span>GHG Protocol Corporate Standard + scope — committed at contract time.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-ghg-iso-14064-v1</span><span>ISO 14064 family + scope — committed at contract time.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-ghg-pas-2050-v1</span><span>PAS 2050 product carbon footprint + scope — committed at contract time.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-ghg-en-16258-v1</span><span>EN 16258 transport-emissions methodology + scope — committed at contract time.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-ghg-custom-v1</span><span>Custom or non-standard GHG methodology + scope — committed at contract time.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-ghg-measurement-v1</span><span>Runtime grams CO2e per fulfillment — estimate / measured / restated / verified.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-delivery-lifecycle-v1</span><span>Stage progression: prep → ready → en-route → picked-up → delivered.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-proximity-policy-v1</span><span>Required detection band committed at agreement signing (Category-2). Sister of <code>figaro-proximity-proof-v1</code>.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-proximity-proof-v1</span><span>Per-handoff nonce + signed witness payload at runtime (Category-1). Off-chain consumers verify proof.band == policy.band.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-merchant-process-v1</span><span>Restaurant-side lifecycle: received → accepted → prep → ready → handed-off.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-courier-process-v1</span><span>Driver-side lifecycle: available → accepted → en-route → arrived → in-transit → completed.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-jurisdiction-v1</span><span>Off-chain dispute-resolution jurisdiction (applicable law + forum + language) — baseline graph per Paper E.</span></li>
                    <li className="flex gap-3"><span className="font-mono text-xs text-gray-400 mt-0.5 w-48 shrink-0 truncate">figaro-consent-v1</span><span>Cryptographic consent attestation: a wallet binds itself to an off-chain legal document via its keccak256 hash, version, and title. Append-only.</span></li>
                </ul>
            </section>

            {/* Add a new schema */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Adding your own
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    The nine-step checklist.
                </h2>
                <ol className="space-y-3 text-sm text-gray-700 leading-relaxed list-decimal pl-5">
                    <li>Write the JSON spec at <code>sdk/src/schemas/examples/&lt;your-schema&gt;.json</code>.</li>
                    <li>Mirror it in <code>frontend/lib/shared/schemas/&lt;your-schema&gt;.json</code> so the UI can preload it.</li>
                    <li>Write the SDK content encoder in <code>sdk/src/schemas/encode.ts</code> and export from <code>index.ts</code>.</li>
                    <li>Add a conformance test in <code>sdk/tests/schemas/examples.test.ts</code>.</li>
                    <li>Write the Solidity validator at <code>src/schemaValidators/Foo&lt;Schema&gt;V1Validator.sol</code> &mdash; ABI-decode content, revert with typed custom errors.</li>
                    <li>Write Foundry tests at <code>test/schemaValidators/</code> covering happy paths and every typed revert.</li>
                    <li>Mirror the validator in the Rust prover when Layer B is live (deferred).</li>
                    <li>List your schema on the builders page &ldquo;Schema validators in force&rdquo; section.</li>
                    <li>Wire <code>setValidator(schemaId, validator)</code> into <code>script/Deploy.s.sol</code> and <code>script/DeployMainnet.s.sol</code>; add a regression test in <code>test/DeployScriptTest.t.sol</code>.</li>
                </ol>
                <p className="mt-6 text-sm text-gray-500 leading-relaxed">
                    Skipping any step produces one of two failure modes: Layer A silently accepts content the on-chain validator would reject (spec drift), or Layer C rejects everything under the schemaId (missing registration). Lockstep is the invariant that makes the pattern worth using.
                </p>
            </section>

            {/* Where to look */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Where to look
                </p>
                <ul className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    <li><strong>SDK module:</strong> <code>@figaro/core/schemas</code> &mdash; the meta-schema validator, <code>validateContent</code>, per-schema encoders. The canonical source of the spec format.</li>
                    <li><strong>Solidity interface:</strong> <code>src/ISchemaValidator.sol</code> &mdash; the two-method interface every on-chain validator implements.</li>
                    <li><strong>Registration path:</strong> <code>AttestationCoordinator.setValidator(schemaId, validator)</code> &mdash; permissionless, first-write-wins, binding immutable once set.</li>
                    <li><strong>Repository:</strong> <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">github.com/figaro-protocol/Figaro-Prototype2</a>. The <code>CLAUDE.md</code> at the root is the authoritative inventory; the &ldquo;Adding a new schema&rdquo; checklist above mirrors the one there.</li>
                </ul>
                <p className="mt-6 text-sm text-gray-500">
                    Related:&nbsp;
                    <Link href="/builders" className="underline hover:text-black">composing an assembly</Link>
                    &nbsp;(how your schema gets used);&nbsp;
                    <Link href="/spec" className="underline hover:text-black">spec</Link>
                    &nbsp;(the discipline for adding a new mechanism contract above the kernel).
                </p>
            </section>

        </>
    );
}
