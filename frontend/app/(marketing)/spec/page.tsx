import type { Metadata } from "next";
import Link from "next/link";
import { ContractEntry } from "@/components/shared/ContractEntry";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Specifications — Figaro Protocol",
    description: "Canonical on-chain surface: kernel, attestation coordinator, schema registry, validators in force, token, batch verifier, and optional protocol contracts.",
};

const GH = "https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/src";

export default function Specifications() {
    return (
        <>
            <MarketingHero
                title="The canonical surface."
                lead={
                    <>
                        Every contract is a permissionless primitive. No contract belongs to a dapp. Solidity 0.8.26. Source-available at{" "}
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="underline">figaro-protocol/Figaro-Prototype2</a>.
                    </>
                }
            />

            <MarketingSection title="Inheritance">
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    This page catalogues the <strong>on-chain composition</strong> layer (the kernel plus the permissionless primitives built around it). Each contract below inherits the kernel&apos;s ownerless / tamper-evident / atomic-settlement properties &mdash; the invariants stated on <Link href="/protocol" className="underline">Protocol</Link>. The kernel in turn inherits execution security from whichever EVM chain it is deployed on &mdash; network → kernel → on-chain composition → off-chain composition → trade. Remove any floor and what&apos;s above collapses.
                </p>
                <p className="text-sm text-ink-muted">
                    Off-chain composition lives at <Link href="/builders" className="underline">/builders</Link>; the stack as a whole is summarised on <Link href="/" className="underline">the home page</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Kernel">
                <ul className="space-y-4">
                    <ContractEntry
                        id="FigaroCore"
                        title="FigaroCore.sol"
                        href={`${GH}/FigaroCore.sol`}
                        meta="2 fns · 3 mappings · no owner"
                        desc="Protocol kernel. commit (unified dual-signed) and resolveProcess. EIP-712 dual-signed commitments; asymmetric bonding; direct transfer at resolution."
                    />
                    <ContractEntry
                        id="CommitmentTypes"
                        title="CommitmentTypes.sol"
                        href={`${GH}/CommitmentTypes.sol`}
                        desc="EIP-712 typed structs and hash functions. Single Commitment struct for root and sub-orders; processId zero for root."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Attestation &amp; schema">
                <ul className="space-y-4">
                    <ContractEntry
                        id="AttestationCoordinator"
                        title="AttestationCoordinator.sol"
                        href={`${GH}/AttestationCoordinator.sol`}
                        meta="receipt-bound · validator-gated"
                        desc="Three attest modes (seller / buyer / resolver). Merkle inclusion proof against the signed agreementHash before validator invocation. Attestations whose clause was not committed cannot land (InvalidInclusionProof revert)."
                    />
                    <ContractEntry
                        id="SchemaRegistry"
                        title="SchemaRegistry.sol"
                        href={`${GH}/SchemaRegistry.sol`}
                        meta="permissionless · event-only"
                        desc="Event-only schema anchoring. schemaId = keccak256(humanReadableName). uriHash points at off-chain JSON spec."
                    />
                    <ContractEntry
                        id="ISchemaValidator"
                        title="ISchemaValidator.sol"
                        href={`${GH}/ISchemaValidator.sol`}
                        meta="per-schemaId · view"
                        desc="Per-schema content validator interface. Reverts on invalid content; binds to one schemaId via schemaId(). No admin, no mutable state."
                    />
                    <ContractEntry
                        id="SchemaRegistrationHelper"
                        title="SchemaRegistrationHelper.sol"
                        href={`${GH}/SchemaRegistrationHelper.sol`}
                        meta="atomic register+bind"
                        desc="Stateless helper. registerSchemaAndValidator(schemaId, version, uriHash, validator) composes registry + setValidator in one transaction. Closes the front-running window for post-deploy third-party schema registration. No admin, no fee, no privilege over targets — just a permissionless composer."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Schema validators in force">
                <p className="text-sm text-ink-muted mb-6">
                    Sixteen runtime-attestable schemas have deployed <code>ISchemaValidator</code> contracts. <code>figaro-topology-v1</code> is a manifest-only clause &mdash; parties commit to it at contract-signing time; it has no on-chain validator.
                </p>
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">schemaId</th>
                                <th scope="col" className="py-2 pr-4">What it carries</th>
                                <th scope="col" className="py-2">Attestation</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default">
                            <tr><td className="py-2 pr-4"><code>figaro-topology-v1</code></td><td className="py-2 pr-4 text-ink-body">DAG lineage (parent order hashes)</td><td className="py-2 text-ink-muted">Manifest-only</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-commerce-v1</code></td><td className="py-2 pr-4 text-ink-body">Currency, payment, line items</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-geo-v2</code></td><td className="py-2 pr-4 text-ink-body">Origin / destination geohash, mass, volume, class of service</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-fulfilment-v2</code></td><td className="py-2 pr-4 text-ink-body">Fulfilment in one clause: modality, coordination, handoff point</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-ghg-protocol-v1</code></td><td className="py-2 pr-4 text-ink-body">GHG Protocol Corporate Standard + scope (Category-2)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-ghg-iso-14064-v1</code></td><td className="py-2 pr-4 text-ink-body">ISO 14064 family + scope (Category-2)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-ghg-pas-2050-v1</code></td><td className="py-2 pr-4 text-ink-body">PAS 2050 product carbon footprint + scope (Category-2)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-ghg-en-16258-v1</code></td><td className="py-2 pr-4 text-ink-body">EN 16258 transport methodology + scope (Category-2)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-ghg-custom-v1</code></td><td className="py-2 pr-4 text-ink-body">Custom GHG methodology + scope (Category-2)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-ghg-measurement-v1</code></td><td className="py-2 pr-4 text-ink-body">Runtime grams CO₂e (Category-1)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-delivery-lifecycle-v1</code></td><td className="py-2 pr-4 text-ink-body">Stage progression (5 stages) + evidence URI</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-proximity-policy-v1</code></td><td className="py-2 pr-4 text-ink-body">Required detection band committed at agreement signing (Category-2)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-proximity-proof-v1</code></td><td className="py-2 pr-4 text-ink-body">Per-handoff nonce + signed witness payload at runtime (Category-1)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-merchant-process-v1</code></td><td className="py-2 pr-4 text-ink-body">Merchant per-role event log (sovereign log; generic across local-commerce verticals)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-courier-process-v1</code></td><td className="py-2 pr-4 text-ink-body">Courier per-role event log (sovereign log; generic across transport modes)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-jurisdiction-v1</code></td><td className="py-2 pr-4 text-ink-body">Off-chain dispute-resolution jurisdiction (applicable law + forum + language) &mdash; baseline graph per Paper E</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                            <tr><td className="py-2 pr-4"><code>figaro-consent-v1</code></td><td className="py-2 pr-4 text-ink-body">Cryptographic consent to an off-chain legal document (documentHash + version + title)</td><td className="py-2 text-ink-muted">Layer A + C</td></tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-ink-muted mt-4">
                    Layer A = client-side TypeScript validator. Layer C = on-chain Solidity validator. Both parse the same canonical JSON spec. See{" "}
                    <Link href="/schemas" className="underline">Schemas</Link> for the three-layer validation architecture.
                </p>
            </MarketingSection>

            <MarketingSection title="Token">
                <ul className="space-y-4">
                    <ContractEntry
                        id="FigToken"
                        title="FigToken.sol"
                        href={`${GH}/fig/FigToken.sol`}
                        meta="ERC-20 + permit · 1B cap"
                        desc="ERC-20 + EIP-2612 permit. 1,000,000,000 MAX_SUPPLY hard cap on every mint. Minter registry with totalRegisteredCap. Deployer registers capped minters, then renounces."
                    />
                    <ContractEntry
                        id="StagedMerkleAirdrop"
                        title="StagedMerkleAirdrop.sol"
                        href={`${GH}/fig/StagedMerkleAirdrop.sol`}
                        meta="3 stages · one-shot per claim"
                        desc="Three-stage merkle-claim airdrop (year 2 / 5 / 9). Three immutable merkle roots, three immutable unlock timestamps. Calls IFigMinter.mint on claim."
                    />
                    <ContractEntry
                        id="IFigMinter"
                        title="IFigMinter.sol"
                        href={`${GH}/fig/IFigMinter.sol`}
                        desc="Single-method minter interface (mint(address, uint256)) implemented by FigToken. Anchors the minter-registry composition pattern."
                    />
                </ul>
                <p className="text-xs text-ink-muted mt-4">
                    Allocation: 100M founders (genesis), 300M DAO (genesis), 600M community airdrop (300 / 200 / 100 at yr 2 / 5 / 9). See <Link href="/fig" className="underline">FIG</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Batch verification">
                <ul className="space-y-4">
                    <ContractEntry
                        id="FigaroBatchVerifier"
                        title="FigaroBatchVerifier.sol"
                        href={`${GH}/FigaroBatchVerifier.sol`}
                        meta="SP1-proved · off-chain execution"
                        desc="On-chain verifier for SP1-proved batches. Verifies state root continuity, chain binding, auxiliary data hashes. Executes net token transfers."
                    />
                    <ContractEntry
                        id="ISP1Verifier"
                        title="ISP1Verifier.sol"
                        href={`${GH}/interfaces/ISP1Verifier.sol`}
                        desc="Succinct SP1 verifier gateway interface."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Optional protocol contracts">
                <ul className="space-y-4">
                    <ContractEntry
                        id="DutchAuction"
                        title="DutchAuction.sol"
                        href={`${GH}/DutchAuction.sol`}
                        desc="Descending-price coordination primitive. No token handling."
                    />
                    <ContractEntry
                        id="OperatorRegistry"
                        title="OperatorRegistry.sol"
                        href={`${GH}/OperatorRegistry.sol`}
                        meta="self-register · reclaimable deposit"
                        desc="Permissionless operator self-registration with reclaimable ETH deposit. Two functions (register, withdraw); state is dedup-only. Operator availability is signal-by-availability off-chain, not registry state."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Canonical deployments">
                <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Network</th>
                                <th scope="col" className="py-2 pr-4">Chain ID</th>
                                <th scope="col" className="py-2">Status</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default">
                            <tr><td className="py-2 pr-4">Local Anvil</td><td className="py-2 pr-4 font-mono">31337</td><td className="py-2 text-ink-muted">Devnet (active)</td></tr>
                            <tr><td className="py-2 pr-4">Ethereum mainnet</td><td className="py-2 pr-4 font-mono">1</td><td className="py-2 text-ink-muted">Pending external audit</td></tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-xs text-ink-muted mt-4">
                    Kernel surface is frozen for external audit. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/RELEASE_READINESS.md" target="_blank" rel="noopener noreferrer" className="underline">RELEASE_READINESS.md</a>{" "}
                    for gate criteria, the frozen-surface declaration, and the hardening completion record.
                </p>
            </MarketingSection>

            <MarketingSection title="Extension" bottomPad="wide">
                <p className="text-sm text-ink-body leading-relaxed">
                    Mechanisms, schemas, and role models extend the protocol without altering the kernel. The kernel invariants the Extension doctrine protects are catalogued on <Link href="/protocol" className="underline">Protocol</Link>; the academic frame for why the kernel is narrow is on <Link href="/cryptoeconomics" className="underline">Cryptoeconomics</Link>. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/PROTOCOL_EXTENSION_DOCTRINE.md" target="_blank" rel="noopener noreferrer" className="underline">PROTOCOL_EXTENSION_DOCTRINE.md</a>{" "}
                    for the three tiers, and the{" "}
                    <Link href="/builders" className="underline">Builders</Link> surface for composition tools.
                </p>
            </MarketingSection>
        </>
    );
}
