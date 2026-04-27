import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Specifications — Figaro Protocol",
    description: "Canonical on-chain surface: kernel, attestation coordinator, schema registry, validators in force, token, batch verifier, and optional mechanism modules.",
};

function Entry({
    id,
    title,
    desc,
    href,
    meta,
}: {
    id?: string;
    title: string;
    desc: string;
    href?: string;
    meta?: string;
}) {
    return (
        <li id={id} className="border-b border-gray-100 pb-4">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div className="text-black font-medium">
                    {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            <code>{title}</code>
                        </a>
                    ) : (
                        <code>{title}</code>
                    )}
                </div>
                {meta && <div className="text-xs text-gray-500">{meta}</div>}
            </div>
            <p className="text-sm text-gray-600 mt-1">{desc}</p>
        </li>
    );
}

const GH = "https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/src";

export default function Specifications() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Specifications
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    The canonical surface.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Every contract is a permissionless primitive. No contract belongs to a dapp. Solidity 0.8.26. Source-available at{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="underline">figaro-protocol/Figaro-Prototype2</a>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Inheritance
                </h2>
                <p className="text-base text-gray-700 leading-relaxed mb-3">
                    This page catalogues the <strong>on-chain composition</strong> layer (the kernel plus the permissionless primitives built around it). Each contract below inherits the kernel&apos;s ownerless / tamper-evident / atomic-settlement properties. The kernel in turn inherits execution security from whichever EVM chain it is deployed on — network → kernel → on-chain composition → off-chain composition → trade. Remove any floor and what&apos;s above collapses.
                </p>
                <p className="text-sm text-gray-600">
                    Off-chain composition lives at <Link href="/builders" className="underline">/builders</Link>; the stack as a whole is summarised on <Link href="/" className="underline">the home page</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Kernel
                </h2>
                <ul className="space-y-4">
                    <Entry
                        title="FigaroCore.sol"
                        href={`${GH}/FigaroCore.sol`}
                        meta="2 fns · 3 mappings · no owner"
                        desc="Protocol kernel. commit (unified dual-signed) and resolveProcess. EIP-712 dual-signed commitments; asymmetric bonding; direct transfer at resolution."
                    />
                    <Entry
                        title="CommitmentTypes.sol"
                        href={`${GH}/CommitmentTypes.sol`}
                        desc="EIP-712 typed structs and hash functions. Single Commitment struct for root and sub-orders; processId zero for root."
                    />
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Attestation &amp; schema
                </h2>
                <ul className="space-y-4">
                    <Entry
                        title="AttestationCoordinator.sol"
                        href={`${GH}/AttestationCoordinator.sol`}
                        meta="receipt-bound · validator-gated"
                        desc="Three attest modes (seller / buyer / resolver). Merkle inclusion proof against the signed agreementHash before validator invocation. Attestations whose clause was not committed cannot land."
                    />
                    <Entry
                        title="SchemaRegistry.sol"
                        href={`${GH}/SchemaRegistry.sol`}
                        meta="permissionless · event-only"
                        desc="Event-only schema anchoring. schemaId = keccak256(humanReadableName). uriHash points at off-chain JSON spec."
                    />
                    <Entry
                        title="ISchemaValidator.sol"
                        href={`${GH}/ISchemaValidator.sol`}
                        meta="per-schemaId · view"
                        desc="Per-schema content validator interface. Reverts on invalid content; binds to one schemaId via schemaId(). No admin, no mutable state."
                    />
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Schema validators in force
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                    Sixteen runtime-attestable schemas have deployed <code>ISchemaValidator</code> contracts. <code>figaro-topology-v1</code> is a manifest-only clause &mdash; parties commit to it at contract-signing time; it has no on-chain validator.
                </p>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-300 text-left text-xs font-semibold uppercase tracking-widest text-gray-600">
                            <th className="py-2 pr-4">schemaId</th>
                            <th className="py-2 pr-4">What it carries</th>
                            <th className="py-2">Attestation</th>
                        </tr>
                    </thead>
                    <tbody className="[&>tr]:border-b [&>tr]:border-gray-100">
                        <tr><td className="py-2 pr-4"><code>figaro-topology-v1</code></td><td className="py-2 pr-4 text-gray-700">DAG lineage (parent order hashes)</td><td className="py-2 text-gray-500">Manifest-only</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-handoff-v1</code></td><td className="py-2 pr-4 text-gray-700">Physical-exchange mode</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-commerce-v1</code></td><td className="py-2 pr-4 text-gray-700">Currency, payment, line items</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-geo-v1</code></td><td className="py-2 pr-4 text-gray-700">Origin / destination geohash</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-fulfilment-v1</code></td><td className="py-2 pr-4 text-gray-700">Fulfilment method (single canonical enum: modality + who-organizes)</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-ghg-protocol-v1</code></td><td className="py-2 pr-4 text-gray-700">GHG Protocol Corporate Standard + scope</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-ghg-iso-14064-v1</code></td><td className="py-2 pr-4 text-gray-700">ISO 14064 family + scope</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-ghg-pas-2050-v1</code></td><td className="py-2 pr-4 text-gray-700">PAS 2050 product carbon footprint + scope</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-ghg-en-16258-v1</code></td><td className="py-2 pr-4 text-gray-700">EN 16258 transport methodology + scope</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-ghg-custom-v1</code></td><td className="py-2 pr-4 text-gray-700">Custom GHG methodology + scope</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-ghg-measurement-v1</code></td><td className="py-2 pr-4 text-gray-700">Runtime grams CO₂e (Category-1)</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-delivery-lifecycle-v1</code></td><td className="py-2 pr-4 text-gray-700">Stage progression (5 stages) + evidence URI</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-proximity-policy-v1</code></td><td className="py-2 pr-4 text-gray-700">Required detection band committed at agreement signing (Category-2)</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-proximity-proof-v1</code></td><td className="py-2 pr-4 text-gray-700">Per-handoff nonce + signed witness payload at runtime (Category-1)</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-merchant-process-v1</code></td><td className="py-2 pr-4 text-gray-700">Merchant per-role event log (sovereign log; generic across local-commerce verticals)</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                        <tr><td className="py-2 pr-4"><code>figaro-courier-process-v1</code></td><td className="py-2 pr-4 text-gray-700">Courier per-role event log (sovereign log; generic across transport modes)</td><td className="py-2 text-gray-500">Layer A + C</td></tr>
                    </tbody>
                </table>
                <p className="text-xs text-gray-500 mt-4">
                    Layer A = client-side TypeScript validator. Layer C = on-chain Solidity validator. Both parse the same canonical JSON spec. See{" "}
                    <Link href="/schemas" className="underline">Schemas</Link> for the three-layer validation architecture.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Token
                </h2>
                <ul className="space-y-4">
                    <Entry
                        title="FigToken.sol"
                        href={`${GH}/fig/FigToken.sol`}
                        meta="ERC-20 + permit · 1B cap"
                        desc="ERC-20 + EIP-2612 permit. 1,000,000,000 MAX_SUPPLY hard cap on every mint. Minter registry with totalRegisteredCap. Deployer registers capped minters, then renounces."
                    />
                    <Entry
                        title="StagedMerkleAirdrop.sol"
                        href={`${GH}/fig/StagedMerkleAirdrop.sol`}
                        meta="3 stages · one-shot per claim"
                        desc="Three-stage merkle-claim airdrop (year 2 / 5 / 9). Three immutable merkle roots, three immutable unlock timestamps. Calls IFigMinter.mint on claim."
                    />
                </ul>
                <p className="text-xs text-gray-500 mt-4">Allocation: 100M founders (genesis), 300M DAO (genesis), 600M community airdrop (300 / 200 / 100 at yr 2 / 5 / 9). See <Link href="/fig" className="underline">FIG</Link>.</p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Batch verification
                </h2>
                <ul className="space-y-4">
                    <Entry
                        title="FigaroBatchVerifier.sol"
                        href={`${GH}/FigaroBatchVerifier.sol`}
                        meta="SP1-proved · off-chain execution"
                        desc="On-chain verifier for SP1-proved batches. Verifies state root continuity, chain binding, auxiliary data hashes. Executes net token transfers."
                    />
                    <Entry
                        title="ISP1Verifier.sol"
                        href={`${GH}/interfaces/ISP1Verifier.sol`}
                        desc="Succinct SP1 verifier gateway interface."
                    />
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Mechanism primitives (optional)
                </h2>
                <ul className="space-y-4">
                    <Entry
                        title="DutchAuction.sol"
                        href={`${GH}/DutchAuction.sol`}
                        desc="Descending-price coordination primitive. No token handling."
                    />
                    <Entry
                        title="OperatorRegistry.sol"
                        href={`${GH}/OperatorRegistry.sol`}
                        meta="self-register · reclaimable deposit"
                        desc="Permissionless operator self-registration with reclaimable ETH deposit. Two functions (register, withdraw); state is dedup-only. Operator availability is signal-by-availability off-chain, not registry state."
                    />
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Canonical deployments
                </h2>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-300 text-left text-xs font-semibold uppercase tracking-widest text-gray-600">
                            <th className="py-2 pr-4">Network</th>
                            <th className="py-2 pr-4">Chain ID</th>
                            <th className="py-2">Status</th>
                        </tr>
                    </thead>
                    <tbody className="[&>tr]:border-b [&>tr]:border-gray-100">
                        <tr><td className="py-2 pr-4">Local Anvil</td><td className="py-2 pr-4 font-mono">31337</td><td className="py-2 text-gray-500">Devnet (active)</td></tr>
                        <tr><td className="py-2 pr-4">Ethereum mainnet</td><td className="py-2 pr-4 font-mono">1</td><td className="py-2 text-gray-500">Pending external audit</td></tr>
                    </tbody>
                </table>
                <p className="text-xs text-gray-500 mt-4">
                    Kernel surface is frozen for external audit. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/FREEZE_NOTICE.md" target="_blank" rel="noopener noreferrer" className="underline">FREEZE_NOTICE.md</a>{" "}
                    for the frozen surface declaration and{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/RELEASE_READINESS.md" target="_blank" rel="noopener noreferrer" className="underline">RELEASE_READINESS.md</a>{" "}
                    for gate criteria.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Extension
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Mechanisms, schemas, and role models extend the protocol without altering the kernel. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/PROTOCOL_EXTENSION_DOCTRINE.md" target="_blank" rel="noopener noreferrer" className="underline">PROTOCOL_EXTENSION_DOCTRINE.md</a>{" "}
                    for the three tiers, and the{" "}
                    <Link href="/builders" className="underline">Builders</Link> surface for composition tools.
                </p>
            </section>
        </>
    );
}
