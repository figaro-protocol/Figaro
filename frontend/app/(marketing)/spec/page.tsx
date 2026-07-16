import type { Metadata } from "next";
import Link from "next/link";
import { ContractEntry } from "@/components/shared/ContractEntry";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Specifications — Figaro Protocol",
    description: "Canonical on-chain surface: kernel, attestation coordinator, clause registry, token, and optional protocol contracts.",
};

const GH = "https://github.com/figaro-protocol/Figaro/blob/main/src";

export default function Specifications() {
    return (
        <>
            <MarketingHero
                title="The canonical surface."
                lead={
                    <>
                        Every contract is a permissionless primitive. No contract belongs to a dapp. Solidity 0.8.26. Source-available at{" "}
                        <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="underline">figaro-protocol/Figaro</a>.
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

            <MarketingSection title="Attestation &amp; clause">
                <ul className="space-y-4">
                    <ContractEntry
                        id="AttestationCoordinator"
                        title="AttestationCoordinator.sol"
                        href={`${GH}/AttestationCoordinator.sol`}
                        meta="receipt-bound · merkle-only"
                        desc="Three attest modes (seller / buyer / resolver). A merkle inclusion proof binds each attestation to the signed agreementHash, and the evidence is content-hashed; the chain validates no content shape. Attestations whose clause was not committed cannot land (InvalidInclusionProof revert)."
                    />
                    <ContractEntry
                        id="ClauseRegistry"
                        title="ClauseRegistry.sol"
                        href={`${GH}/ClauseRegistry.sol`}
                        meta="permissionless · event-only"
                        desc="Event-only clause anchoring, first-write-wins. clauseId is the bare human-readable name; the on-chain identity/dedup key is keccak256(abi.encode(clauseId, version)), so name+version together form the key. contentURI points at the off-chain JSON spec, and the registry stores its keccak256 contentHash as the integrity anchor the batch verifier binds witness specs to (contentHashOf). The registry validates no content shape itself — a registered clause is immediately attestable, and settleable through the proven path."
                    />
                    <ContractEntry
                        id="FigaroBatchVerifier"
                        title="FigaroBatchVerifier.sol"
                        href={`${GH}/FigaroBatchVerifier.sol`}
                        meta="SP1 proof · open-world content check"
                        desc="Batched settlement via a single SP1 validity proof. A generic in-proof engine validates each clause's content against its spec (supplied as a witness); settleBatch accepts the batch only if every (clauseId → witness-spec hash) binding equals ClauseRegistry.contentHashOf(clauseId), then reconciles net token positions and re-emits attestation events. The program verification key covers the engine, not a clause list — a never-seen clause settles with zero code changes. No owner, no fee, no upgrade. Devnet wires MockSP1Verifier; mainnet wires Succinct's SP1 gateway + program vkey from env."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Clause validation">
                <p className="text-base text-ink-body leading-relaxed">
                    Clause content is validated <strong>off-chain</strong> (the Layer-A TypeScript SDK) before signing, and re-validated <strong>on-chain</strong> on the batched, proof-based settlement path &mdash; a generic SP1 engine checks each clause against its registry-anchored spec, so a never-seen clause settles with zero per-clause on-chain code. The direct attestation path merkle-binds but validates no content shape. <code>figaro-topology</code> is agreement-only &mdash; committed at signing, with no runtime attestation. The full inventory &mdash; every clauseId and what it carries &mdash; is on <Link href="/clauses" className="underline">Clauses</Link>.
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
                        id="IFigMinter"
                        title="IFigMinter.sol"
                        href={`${GH}/fig/IFigMinter.sol`}
                        desc="Single-method minter interface (mint(address, uint256)) implemented by FigToken. Anchors the minter-registry composition pattern."
                    />
                </ul>
                <p className="text-xs text-ink-muted mt-4">
                    Allocation: 100M founders (genesis), 300M DAO (genesis), 600M RPGF to clause authors + assembly designers of record (RpgfMinter &mdash; registered at genesis; optimistic post / challenge / finalize / claim). See <Link href="/papers/fig-schelling-point-token" className="underline">FIG</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Optional protocol contracts">
                <ul className="space-y-4">
                    <ContractEntry
                        id="SellerRegistry"
                        title="SellerRegistry.sol"
                        href={`${GH}/SellerRegistry.sol`}
                        meta="self-register · reclaimable deposit"
                        desc="Permissionless seller self-registration with reclaimable ETH deposit. Two functions (register, withdraw); state is dedup-only. Seller availability is signal-by-availability off-chain, not registry state."
                    />
                    <ContractEntry
                        id="AssemblyRegistry"
                        title="AssemblyRegistry.sol"
                        href={`${GH}/AssemblyRegistry.sol`}
                        meta="self-register · reclaimable deposit"
                        desc="Permissionless assembly anchoring with reclaimable ETH deposit — the assembly artifact family's anchor, parallel to ClauseRegistry and SellerRegistry. Two functions (registerAssembly, withdrawDeposit); first-write-wins. Identity IS the composition: compositionHash = keccak256 of the template's canonical composition subset, so identical compositions collapse to one binding and the human slug is derived off-chain (deriveAssemblySlug). The binding is permanent — withdraw returns only the deposit and de-surfaces the assembly; no owner, no admin, no content validation."
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
                    Per-network contract addresses ship in the deployment record the deploy script emits &mdash; <code>.deployments/local.json</code> for the local devnet. Each public network&apos;s addresses are published in this table when it goes live; the record&apos;s key&nbsp;&rarr;&nbsp;SDK mapping is on <Link href="/integrate" className="underline">Integrate</Link>.
                </p>
                <p className="text-xs text-ink-muted mt-4">
                    Kernel surface is frozen for external audit. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/RELEASE_READINESS.md" target="_blank" rel="noopener noreferrer" className="underline">RELEASE_READINESS.md</a>{" "}
                    for gate criteria, the frozen-surface declaration, and the hardening completion record.
                </p>
            </MarketingSection>

            <MarketingSection title="Composition">
                <p className="text-sm text-ink-body leading-relaxed">
                    Mechanisms, clauses, and role models extend the protocol without altering the kernel. The kernel invariants the Composition doctrine protects are catalogued on <Link href="/protocol" className="underline">Protocol</Link>; the academic frame for why the kernel is narrow is on <Link href="/cryptoeconomics" className="underline">Cryptoeconomics</Link>. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/CLAUSES.md" target="_blank" rel="noopener noreferrer" className="underline">CLAUSES.md</a>{" "}
                    for the clause validation architecture and the anchoring doctrine, and the{" "}
                    <Link href="/builders" className="underline">Builders</Link> surface for composition tools.
                </p>
            </MarketingSection>

            <MarketingSection title="More on the protocol" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/protocol" className="text-ink-heading font-medium hover:underline">
                            Protocol
                        </Link>
                        <span className="text-ink-body"> &mdash; how the mechanism works: bonded commitments, buyer dominance, twice-the-deal collateral, atomic settlement.</span>
                    </li>
                    <li>
                        <Link href="/why" className="text-ink-heading font-medium hover:underline">
                            Why
                        </Link>
                        <span className="text-ink-body"> &mdash; the rule-making lineage: coercion, cognition, crypto. What Figaro contributes to the third.</span>
                    </li>
                    <li>
                        <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">
                            Cryptoeconomics
                        </Link>
                        <span className="text-ink-body"> &mdash; the eight disciplines that read the substrate, organized along the Voshmgir &amp; Zargham taxonomy, and the papers along each.</span>
                    </li>
                    <li>
                        <Link href="/audit" className="text-ink-heading font-medium hover:underline">
                            Audit
                        </Link>
                        <span className="text-ink-body"> &mdash; the live verification surface: verify any deal yourself &mdash; a process&apos;s record and its hashes, readable by anyone, no wallet required.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
