import type { Metadata } from "next";
import Link from "next/link";
import { ContractEntry } from "@/components/shared/ContractEntry";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Specifications — Figaro Protocol",
    description: "Canonical on-chain surface: kernel, attestation coordinator, clause registry, validators in force, token, batch verifier, and optional protocol contracts.",
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
                        meta="receipt-bound · validator-gated"
                        desc="Three attest modes (seller / buyer / resolver). Merkle inclusion proof against the signed agreementHash before validator invocation. Attestations whose clause was not committed cannot land (InvalidInclusionProof revert)."
                    />
                    <ContractEntry
                        id="ClauseRegistry"
                        title="ClauseRegistry.sol"
                        href={`${GH}/ClauseRegistry.sol`}
                        meta="permissionless · event-only"
                        desc="Event-only clause anchoring. clauseId = keccak256(humanReadableName). uriHash points at off-chain JSON spec."
                    />
                    <ContractEntry
                        id="IClauseValidator"
                        title="IClauseValidator.sol"
                        href={`${GH}/IClauseValidator.sol`}
                        meta="per-clauseId · view"
                        desc="Per-clause content validator interface. Reverts on invalid content; binds to one clauseId via clauseId(). No admin, no mutable state."
                    />
                    <ContractEntry
                        id="ClauseRegistrationHelper"
                        title="ClauseRegistrationHelper.sol"
                        href={`${GH}/ClauseRegistrationHelper.sol`}
                        meta="atomic register+bind"
                        desc="Stateless helper. registerClauseAndValidator(clauseId, version, uriHash, validator) composes registry + setValidator in one transaction. Closes the front-running window for post-deploy third-party clause registration. No admin, no fee, no privilege over targets — just a permissionless composer."
                    />
                </ul>
            </MarketingSection>

            <MarketingSection title="Clause validators in force">
                <p className="text-base text-ink-body leading-relaxed">
                    Every runtime-attestable clause binds to a deployed <code>IClauseValidator</code> contract; <code>figaro-topology-v1</code> is agreement-only &mdash; committed at agreement signing, with no on-chain validator. The full inventory &mdash; every clauseId, what it carries, and the three-layer validation architecture &mdash; is on <Link href="/clauses" className="underline">Clauses</Link>.
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
                        id="RpgfMinter"
                        title="RpgfMinter.sol"
                        href={`${GH}/fig/RpgfMinter.sol`}
                        meta="3 stages · SP1-gated · one-shot per claim"
                        desc="Three-stage SP1-gated retroactive public-goods funding minter (year 2 / 5 / 9). Three immutable unlock timestamps; per-tranche Merkle roots submitted by the sequencer after an SP1 proof verifies the substrate-broadening aggregation. Calls IFigMinter.mint on claim."
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
                        id="SellerRegistry"
                        title="SellerRegistry.sol"
                        href={`${GH}/SellerRegistry.sol`}
                        meta="self-register · reclaimable deposit"
                        desc="Permissionless seller self-registration with reclaimable ETH deposit. Two functions (register, withdraw); state is dedup-only. Seller availability is signal-by-availability off-chain, not registry state."
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
                    <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/v5/RELEASE_READINESS.md" target="_blank" rel="noopener noreferrer" className="underline">RELEASE_READINESS.md</a>{" "}
                    for gate criteria, the frozen-surface declaration, and the hardening completion record.
                </p>
            </MarketingSection>

            <MarketingSection title="Extension">
                <p className="text-sm text-ink-body leading-relaxed">
                    Mechanisms, clauses, and role models extend the protocol without altering the kernel. The kernel invariants the Extension doctrine protects are catalogued on <Link href="/protocol" className="underline">Protocol</Link>; the academic frame for why the kernel is narrow is on <Link href="/cryptoeconomics" className="underline">Cryptoeconomics</Link>. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro/blob/main/docs/v5/CLAUSES.md" target="_blank" rel="noopener noreferrer" className="underline">CLAUSES.md</a>{" "}
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
                </ul>
            </MarketingSection>
        </>
    );
}
