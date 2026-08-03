/**
 * data-market.devnet.spec.ts — the DATA-MARKET value-legs e2e: the two
 * anchored data reference assemblies run as bonded processes, DUAL POSTURE.
 *
 * The scenario (two processes, the postures mirrored):
 *   1. Member A (seller) FLIES for member B (buyer) under the ADOPTED
 *      aerial-survey assembly — the flight window, route localities,
 *      operator credential, and the data-terms disclosure regime
 *      (design fill `each-own`, the buyer's `buyerDisclosure` filled at
 *      checkout) are committed merkle leaves; sign → both bonds → commit
 *      → resolve.
 *   2. Member B (seller) LICENSES their stream to member A (buyer) under
 *      the ADOPTED data-stream-subscription assembly — the data-license
 *      terms filled at checkout, `sourceProcesses` anchored to process 1's
 *      settled processId (the clause's provenance field); the access
 *      credential delivers via figaro-content-handoff (encrypted-transfer:
 *      the stage-1 attestation anchors keccak256 of the credential bytes,
 *      the content-delivery ceremony's chain shape); commit → resolve.
 *
 * Asserted, ALL from fresh chain reads (never the writing test's state):
 *   - VALUE LEGS per process: bond lock at commit (buyer 2×payment, seller
 *     2×cumulative, escrow both), net at resolve (buyer −payment, seller
 *     +payment, core net 0).
 *   - DUAL POSTURE from OrderCommitted events: wallet A is seller of
 *     process 1 AND buyer of process 2; wallet B the mirror — the
 *     MembersRegistry migration's point (members, not "sellers").
 *   - LEAF DISCLOSURE (the thing this market sells): the data-terms
 *     section of process 1 and the data-license section of process 2 are
 *     SELF-AUTHENTICATING — their inclusion proofs verify against the
 *     on-chain committed agreementHash, and a tampered section does NOT.
 *   - Both members hold LIVE MembersRegistry stakes (registered if absent,
 *     idempotent — the rpgf-rewards pattern).
 *   - The open-record sibling (disclosure `open`) is anchored under a
 *     DISTINCT compositionHash — regime variants are sibling assemblies.
 *
 * Everything consumed is DISCOVERED from chain + IPFS (AssemblyRegistered
 * events → pinned template docs, selected by SHAPE; integrity re-hashed via
 * templateCompositionHash) and realized through the SDK's ONE template walk
 * (reconstructOrdersFromTemplate) — never a hand-coded composition.
 *
 * Wallets: DEDICATED anvil indices 36 (member A) and 37 (member B) — the
 * --accounts 38 bump exists for them. The RUNNING chain may predate the
 * bump, so the spec self-funds their ETH (a plain transfer from anvil[0])
 * and self-mints their MOCK bonds. Fresh salts per run keep re-runs
 * idempotent; nothing is snapshotted or reverted, no time warp.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import { concat, createWalletClient, http, keccak256, parseAbi, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    ASSEMBLY_REGISTRY_ABI,
    ATTESTATION_COORDINATOR_ABI,
    CLAUSE_REGISTRY_ABI,
    MEMBERS_REGISTRY_ABI,
    buildSectionInclusionProof,
    calculateBonds,
    computeClauseKey,
    generateSalt,
    reconstructOrdersFromTemplate,
    sectionDataHash,
    templateCompositionHash,
    verifyInclusionProof,
    type AssemblyTemplate,
    type ReconstructedOrder,
} from '@figaro/sdk';
import { encodeContentFromSpec, parseClauseSpec } from '@figaro/sdk/clauses';
import { LOCAL_ANVIL, RPC_URL, localPublicClient, pinJSONToIPFS, readLocalDeploymentConfig } from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';

const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)',
    'function mint(address, uint256) returns ()',
]);

// ── This spec's DEDICATED wallets (indices 36/37 — see the wallet-allocation
//    rule; never populate-owned 5-12). A sells the flight and buys the stream;
//    B mirrors. Their identities are this test's INPUT DATA (an authoring act).
const MEMBER_A_KEY = ANVIL_KEYS[36] as Hex;
const MEMBER_B_KEY = ANVIL_KEYS[37] as Hex;

// The clauses this scenario proves (shape selectors over discovered templates,
// mirrored from the reference templates — never a composition authored here).
const DATA_TERMS = 'figaro-data-terms';
const DATA_LICENSE = 'figaro-data-license';
const CONTENT_HANDOFF = 'figaro-content-handoff';
const CREDENTIAL = 'figaro-credential';
const PROVENANCE = 'figaro-assembly-provenance';

// The access credential the stream seller delivers — TEST INPUT (what a
// data seller would hand off): a small token document whose BYTES the
// stage-1 completion evidence hashes. The chain never learns them.
const CREDENTIAL_BYTES = Buffer.from(JSON.stringify({
    kind: 'stream-access-credential',
    endpoint: 'wss://streams.example/flight-telemetry',
    token: 'demo-bearer-token-for-e2e',
}));
const CREDENTIAL_HASH = keccak256(new Uint8Array(CREDENTIAL_BYTES));

/** One anchored assembly with its FULL pinned template (discovery keeps the
 *  whole doc — `reconstructOrdersFromTemplate` needs assemblyClauses too,
 *  which the shared shape-only discovery drops). */
interface AnchoredTemplate {
    compositionHash: Hex;
    template: AssemblyTemplate;
}

test.describe('DATA MARKET — dual-posture value legs over the anchored data assemblies (devnet)', () => {
    test.setTimeout(300_000);

    test('A flies for B, B streams to A: adopt → commit → resolve twice, every leaf provable against the chain', async () => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const clauseRegistry = config.clauseRegistry as Hex;
        const membersRegistry = config.membersRegistry as Hex;
        const assemblyRegistry = config.assemblyRegistry as Hex;
        expect(core && token && coordinator && clauseRegistry && membersRegistry && assemblyRegistry,
            'full deployment record (run ./scripts/deploy-local.sh)').toBeTruthy();

        const publicClient = localPublicClient();
        const receipt = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] });
        const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';

        const memberA = privateKeyToAccount(MEMBER_A_KEY);
        const memberB = privateKeyToAccount(MEMBER_B_KEY);
        const walletA = createWalletClient({ account: memberA, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const walletB = createWalletClient({ account: memberB, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // ── SEED (idempotent, before any baseline): the running anvil may
        //    predate the --accounts 38 bump, so 36/37 can be UNFUNDED — a
        //    plain ETH transfer from anvil[0] is how any new wallet arrives;
        //    the open mock mint covers their bonds. ──
        const funder = createWalletClient({
            account: privateKeyToAccount(ANVIL_KEYS[0] as Hex), chain: LOCAL_ANVIL, transport: http(RPC_URL),
        });
        for (const member of [memberA, memberB]) {
            if ((await publicClient.getBalance({ address: member.address })) < parseEther('1')) {
                await receipt(await funder.sendTransaction({ to: member.address, value: parseEther('50') }));
            }
        }
        for (const [wallet, member] of [[walletA, memberA], [walletB, memberB]] as const) {
            if ((await balanceOf(member.address)) < parseEther('50')) {
                await receipt(await wallet.writeContract({
                    address: token, abi: ERC20_ABI, functionName: 'mint', args: [member.address, parseEther('100')],
                }));
            }
        }

        // ── LIVE STAKES: both members hold an un-withdrawn MembersRegistry
        //    deposit (register if absent — the rpgf-rewards idempotency
        //    pattern), asserted from the chain's own registered() view. ──
        const deposit = await publicClient.readContract({
            address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registrationDeposit',
        });
        const ensureRegistered = async (
            wallet: typeof walletA, member: typeof memberA, profile: { name: string; specialty: string },
        ) => {
            if (await publicClient.readContract({
                address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registered', args: [member.address],
            })) return;
            const { uri } = await pinJSONToIPFS({ subjectAddress: member.address, ...profile });
            await receipt(await wallet.writeContract({
                address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'register',
                args: [uri], value: deposit,
            }));
        };
        await ensureRegistered(walletA, memberA, { name: 'Skyline Survey Works', specialty: 'aerial survey flights' });
        await ensureRegistered(walletB, memberB, { name: 'Confluence Data Desk', specialty: 'licensed data streams' });
        for (const [member, label] of [[memberA, 'A'], [memberB, 'B']] as const) {
            expect(
                await publicClient.readContract({
                    address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registered', args: [member.address],
                }),
                `member ${label} holds a LIVE MembersRegistry stake`,
            ).toBe(true);
        }

        // ── ADOPT from chain + IPFS: every anchored template resolved in
        //    full, integrity re-hashed, then selected by SHAPE — never a
        //    hardcoded slug, never a composition authored in the spec. ──
        const anchored: AnchoredTemplate[] = [];
        for (const ev of await publicClient.getContractEvents({
            address: assemblyRegistry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered', fromBlock: 0n,
        })) {
            const { compositionHash, contentURI } = ev.args as { compositionHash?: Hex; contentURI?: string };
            if (!compositionHash || !contentURI) continue;
            try {
                const cid = contentURI.replace(/^ipfs:\/\//, '');
                const doc = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${cid}`, { method: 'POST' })).json() as AssemblyTemplate;
                if (!Array.isArray(doc.agreements) || doc.agreements.length === 0) continue;
                anchored.push({ compositionHash, template: doc });
            } catch {
                continue; // unresolvable/garbage URI — mainnet-realistic tolerance
            }
        }
        const singleOrderWith = (t: AssemblyTemplate, clauseId: string) =>
            t.agreements.length === 1 && clauseId in (t.agreements[0].clauses ?? {});
        const aerialSurvey = anchored.find((a) =>
            singleOrderWith(a.template, CREDENTIAL)
            && (a.template.agreements[0].clauses[DATA_TERMS] as { disclosure?: string } | undefined)?.disclosure === 'each-own');
        const aerialOpen = anchored.find((a) =>
            singleOrderWith(a.template, CREDENTIAL)
            && (a.template.agreements[0].clauses[DATA_TERMS] as { disclosure?: string } | undefined)?.disclosure === 'open');
        const dataStream = anchored.find((a) =>
            singleOrderWith(a.template, DATA_LICENSE) && CONTENT_HANDOFF in a.template.agreements[0].clauses);
        expect(aerialSurvey, 'the aerial-survey reference (disclosure each-own) is anchored').toBeTruthy();
        expect(aerialOpen, 'the open-record sibling (disclosure open) is anchored').toBeTruthy();
        expect(dataStream, 'the data-stream-subscription reference is anchored').toBeTruthy();
        // Reader-side integrity (OUTSIDE the fetch loop's tolerance, so a
        // mismatch FAILS instead of being skipped as unresolvable): the
        // adopted documents re-hash to their anchored identities.
        for (const adopted of [aerialSurvey!, aerialOpen!, dataStream!]) {
            expect(templateCompositionHash(adopted.template), 'the pinned template re-hashes to its anchored identity')
                .toBe(adopted.compositionHash);
        }
        expect(
            aerialOpen!.compositionHash,
            'one changed design fill = a DIFFERENT assembly: regime variants are siblings, not versions',
        ).not.toBe(aerialSurvey!.compositionHash);

        // ── One bonded single-order process, chain-driven end to end:
        //    reconstruct through the SDK's ONE template walk, both parties
        //    sign, bond, commit — value legs asserted from the token
        //    contract at every step. Resolve is separate (process 2 attests
        //    its hand-off while the order is live). ──
        const chainId = LOCAL_ANVIL.id;
        const commitProcess = async (opts: {
            adopted: AnchoredTemplate;
            buyer: typeof memberA; buyerWallet: typeof walletA;
            seller: typeof memberA; sellerWallet: typeof walletA;
            payment: bigint;
            overrides: Record<string, Record<string, unknown>>;
            label: string;
        }) => {
            const chainNow = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp;
            const orders = await reconstructOrdersFromTemplate(opts.adopted.template, {
                buyer: opts.buyer.address,
                currency: token,
                chainId,
                core,
                nodes: () => ({
                    seller: opts.seller.address,
                    payment: opts.payment,
                    overrides: {
                        ...opts.overrides,
                        // The provenance anchor is MECHANICAL, never authored:
                        // the checkout walk writes the adopted assembly's own
                        // verified compositionHash (fillProvenanceSection).
                        [PROVENANCE]: { compositionHash: opts.adopted.compositionHash },
                    },
                }),
                salt: () => generateSalt(),
                deadline: chainNow + 3600n,
            });
            expect(orders, `${opts.label}: the reference is a single-order composition`).toHaveLength(1);
            const order: ReconstructedOrder = orders[0];

            const buyerSig = await opts.buyerWallet.signTypedData(order.typedData);
            const sellerSig = await opts.sellerWallet.signTypedData(order.typedData);
            const { buyerBond, sellerBond } = calculateBonds(order.cumulativeValue, order.payment);

            const [buyer0, seller0, core0] = await Promise.all([
                balanceOf(opts.buyer.address), balanceOf(opts.seller.address), balanceOf(core),
            ]);
            await receipt(await opts.buyerWallet.writeContract({
                address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, buyerBond],
            }));
            await receipt(await opts.sellerWallet.writeContract({
                address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, sellerBond],
            }));
            const commitReceipt = await receipt(await opts.buyerWallet.writeContract({
                address: core, abi: CORE_ABI, functionName: 'commit', args: [order.commitment, buyerSig, sellerSig],
            }));
            expect(commitReceipt.status, `${opts.label}: the commit transaction succeeded`).toBe('success');

            // The commit's chain record — read back out-of-band, never from
            // the reconstruction that produced it.
            const committed = await publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
                args: { buyer: opts.buyer.address }, fromBlock: commitReceipt.blockNumber,
            });
            expect(committed, `${opts.label}: OrderCommitted lands on-chain`).toHaveLength(1);
            const event = committed[0];
            expect(event.args.agreementHash, `${opts.label}: the chain committed the signed agreement root`)
                .toBe(order.agreementHash);

            // VALUE LEG, bond lock: buyer 2×payment, seller 2×cumulative,
            // escrow up by both — read from the token contract.
            const [buyer1, seller1, core1] = await Promise.all([
                balanceOf(opts.buyer.address), balanceOf(opts.seller.address), balanceOf(core),
            ]);
            expect(buyer0 - buyer1, `${opts.label}: buyer locked its 2× bond`).toBe(buyerBond);
            expect(seller0 - seller1, `${opts.label}: seller locked its 2× bond`).toBe(sellerBond);
            expect(core1 - core0, `${opts.label}: FigaroCore escrow holds both bonds`).toBe(buyerBond + sellerBond);

            return { order, event, baselines: { buyer0, seller0, core0 } };
        };

        const resolveProcess = async (
            committed: Awaited<ReturnType<typeof commitProcess>>,
            buyerWallet: typeof walletA, buyer: typeof memberA, seller: typeof memberA, label: string,
        ) => {
            await receipt(await buyerWallet.writeContract({
                address: core, abi: CORE_ABI, functionName: 'resolveProcess',
                args: [committed.event.args.processId!, [committed.order.commitment]],
            }));
            // VALUE LEG, net of the whole cycle: buyer −payment, seller
            // +payment, core exactly flat — the e2e value-legs rule.
            const payment = committed.order.payment;
            const { buyer0, seller0, core0 } = committed.baselines;
            const [buyerF, sellerF, coreF] = await Promise.all([
                balanceOf(buyer.address), balanceOf(seller.address), balanceOf(core),
            ]);
            expect(buyer0 - buyerF, `${label}: buyer net paid exactly the payment`).toBe(payment);
            expect(sellerF - seller0, `${label}: seller net earned exactly the payment`).toBe(payment);
            expect(coreF, `${label}: FigaroCore net 0 — escrow returned to baseline`).toBe(core0);
        };

        /** The self-authenticating leaf — what this market SELLS: the
         *  disclosed section + its inclusion proof verify against the
         *  process's ON-CHAIN committed agreementHash; a tampered section
         *  does not. Root read fresh from the OrderCommitted event. */
        const assertSelfAuthenticatingLeaf = async (
            committed: Awaited<ReturnType<typeof commitProcess>>, clauseId: string, label: string,
        ) => {
            const [eventBack] = await publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
                args: { buyer: committed.event.args.buyer }, fromBlock: committed.event.blockNumber,
            });
            const chainRoot = eventBack.args.agreementHash as Hex;
            const section = committed.order.agreement.sections.find((s) => s.clause === clauseId)!;
            expect(section, `${label}: the agreement carries the ${clauseId} section`).toBeTruthy();
            const { leaf, proof } = buildSectionInclusionProof(committed.order.agreement, clauseId);
            expect(
                leaf,
                `${label}: the leaf is derived from the section's own dataHash — recomputable by any holder`,
            ).toBe(keccak256(keccak256(concat([computeClauseKey(section.clause, section.version), sectionDataHash(section)]))));
            expect(
                verifyInclusionProof(chainRoot, leaf, proof),
                `${label}: the ${clauseId} section verifies against the ON-CHAIN agreementHash — self-authenticating`,
            ).toBe(true);
            const tampered = keccak256(keccak256(concat([
                computeClauseKey(section.clause, section.version),
                sectionDataHash({ ...section, data: { ...section.data, tampered: true } }),
            ])));
            expect(
                verifyInclusionProof(chainRoot, tampered, proof),
                `${label}: a tampered ${clauseId} section does NOT verify — the check is not vacuous`,
            ).toBe(false);
            return section;
        };

        // ── PROCESS 1 — the flight: A (seller) flies for B (buyer) under the
        //    adopted aerial-survey assembly. The window, route, credential,
        //    and disclosure terms are the buyer's checkout fills; the regime
        //    itself (`each-own`) rides in from the template's design fill. ──
        const flight = await commitProcess({
            adopted: aerialSurvey!,
            buyer: memberB, buyerWallet: walletB,
            seller: memberA, sellerWallet: walletA,
            payment: parseEther('1'),
            overrides: {
                'figaro-commerce': {
                    payment: parseEther('1').toString(),
                    lineItems: [{ itemId: 'survey-flight', name: 'Aerial survey flight', quantity: 1, unitPrice: parseEther('1').toString() }],
                },
                'figaro-modalities': { modality: 'consume-onsite' },
                'figaro-schedule': { windowStart: '2026-08-15T09:00:00Z', windowEnd: '2026-08-15T13:00:00Z' },
                'figaro-geolocation': { geocodeStandard: 'geohash', origin: '9q8yyk', destination: '9q8yys' },
                [CREDENTIAL]: {
                    credentialRegisterUri: 'https://uav-register.example/registrations{/id}',
                    credentialTitle: 'Remote pilot certificate',
                    credentialId: 'RPC-107-0042',
                },
                [DATA_TERMS]: { buyerDisclosure: 'permit' },
            },
            label: 'flight',
        });
        // The template's design fill survived reconstruction into the signed
        // section (the regime is the DESIGNER's term, not this spec's input).
        const dataTermsSection = await assertSelfAuthenticatingLeaf(flight, DATA_TERMS, 'flight');
        const committedTerms = (dataTermsSection.data ?? {}) as { disclosure?: string; buyerDisclosure?: string };
        expect(committedTerms.disclosure, 'the each-own regime rode in from the template design fill')
            .toBe('each-own');
        expect(committedTerms.buyerDisclosure, "the buyer's per-order consent is committed, never inferred")
            .toBe('permit');
        await resolveProcess(flight, walletB, memberB, memberA, 'flight');
        const flightProcessId = flight.event.args.processId as Hex;

        // ── PROCESS 2 — the stream: B (seller) licenses to A (buyer) under
        //    the adopted data-stream-subscription assembly; sourceProcesses
        //    anchors the license to process 1's SETTLED processId — exactly
        //    what the clause's provenance field exists for. ──
        const stream = await commitProcess({
            adopted: dataStream!,
            buyer: memberA, buyerWallet: walletA,
            seller: memberB, sellerWallet: walletB,
            payment: parseEther('2'),
            overrides: {
                'figaro-commerce': {
                    payment: parseEther('2').toString(),
                    lineItems: [{ itemId: 'telemetry-stream', name: 'Flight telemetry stream — 30 days', quantity: 1, unitPrice: parseEther('2').toString() }],
                },
                'figaro-modalities': { modality: 'virtual' },
                'figaro-schedule': { windowStart: '2026-09-01T00:00:00Z', windowEnd: '2026-10-01T00:00:00Z' },
                [DATA_LICENSE]: {
                    licenseScope: 'Flight telemetry records of the surveyed route',
                    purpose: 'internal analytics only',
                    access: 'stream',
                    redistribution: 'prohibited',
                    sourceProcesses: [flightProcessId],
                },
                [CONTENT_HANDOFF]: { contentHandoff: ['encrypted-transfer'] },
            },
            label: 'stream',
        });

        // The hand-off ceremony, chain shape (the content-delivery exemplar's
        // out-of-band leg): while the order is LIVE, the seller's stage-1
        // attestation anchors keccak of the stage content — encoded per the
        // REGISTERED spec (ClauseRegistered → IPFS, the same read every
        // consumer does) — over the credential bytes' hash. The chain never
        // learns the bytes; the buyer verifies by rehashing what it received.
        const registration = (await publicClient.getContractEvents({
            address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered', fromBlock: 0n,
        })).filter((e) => e.args.clauseId === CONTENT_HANDOFF).pop();
        expect(registration, `${CONTENT_HANDOFF} is anchored on ClauseRegistry`).toBeTruthy();
        const specCid = (registration!.args.contentURI as string).replace(/^ipfs:\/\//, '');
        const parsed = parseClauseSpec(await (await fetch(`${ipfsApi}/api/v0/cat?arg=${specCid}`, { method: 'POST' })).json());
        if (!parsed.ok) throw new Error('the registered content-handoff spec failed to parse');
        const expectedContentRef = keccak256(
            encodeContentFromSpec(parsed.spec, { contentHash: CREDENTIAL_HASH }, { stage: 1 }),
        );
        const handoffSection = stream.order.agreement.sections.find((s) => s.clause === CONTENT_HANDOFF)!;
        const { proof: handoffProof } = buildSectionInclusionProof(stream.order.agreement, CONTENT_HANDOFF);
        await receipt(await walletB.writeContract({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, functionName: 'attestAsSeller',
            args: [
                stream.order.commitment, stream.order.commitment,
                computeClauseKey(handoffSection.clause, handoffSection.version), 1,
                sectionDataHash(handoffSection), handoffProof, expectedContentRef,
            ],
        }));
        const handoffEvents = await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation',
            args: { processId: stream.event.args.processId }, fromBlock: stream.event.blockNumber,
        });
        expect(
            handoffEvents.some((log) =>
                Number(log.args.stage) === 1
                && (log.args.contentRef as string).toLowerCase() === expectedContentRef.toLowerCase()
                && (log.args.attester as string).toLowerCase() === memberB.address.toLowerCase()),
            "the seller's stage-1 hand-off evidence — keccak over the ENCODED credential hash — lands on-chain",
        ).toBe(true);

        // The license leaf is self-authenticating, and its committed data
        // carries the provenance anchor to process 1's settled processId.
        const licenseSection = await assertSelfAuthenticatingLeaf(stream, DATA_LICENSE, 'stream');
        expect(
            (((licenseSection.data ?? {}) as { sourceProcesses?: string[] }).sourceProcesses ?? [])[0],
            "the committed license anchors process 1's settled processId — chain-verifiable provenance",
        ).toBe(flightProcessId);
        await resolveProcess(stream, walletA, memberA, memberB, 'stream');

        // ── DUAL POSTURE, from the chain's own OrderCommitted records: one
        //    member holds BOTH postures — the MembersRegistry migration's
        //    point (members, not "sellers"; any wallet, either side). ──
        expect(flight.event.args.seller!.toLowerCase(), 'dual posture: wallet A is SELLER of process 1')
            .toBe(memberA.address.toLowerCase());
        expect(flight.event.args.buyer!.toLowerCase(), 'dual posture: wallet B is BUYER of process 1')
            .toBe(memberB.address.toLowerCase());
        expect(stream.event.args.buyer!.toLowerCase(), 'dual posture: the SAME wallet A is BUYER of process 2')
            .toBe(memberA.address.toLowerCase());
        expect(stream.event.args.seller!.toLowerCase(), 'dual posture: the SAME wallet B is SELLER of process 2')
            .toBe(memberB.address.toLowerCase());

        test.info().annotations.push({
            type: 'DataMarket',
            description: `flight process=${flightProcessId} stream process=${stream.event.args.processId} license anchored to flight`,
        });
    });
});
