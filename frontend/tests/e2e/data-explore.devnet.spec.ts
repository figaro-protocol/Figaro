/**
 * data-explore.devnet.spec.ts — the DATA EXPLORER e2e: `/data/explore` reads
 * the process-emitted corpus and renders every graph layer against chain
 * facts a stranger can re-derive.
 *
 * The seed (real machinery, never a hand-coded composition): the anchored
 * aerial-survey reference — discovered from chain + IPFS by SHAPE (single
 * order composing the credential clause, the geo clause, and the each-own
 * data-terms regime), integrity re-hashed — runs once as a bonded process
 * through the SDK's ONE template walk (`reconstructOrdersFromTemplate`):
 * sign → both bonds lock → commit → three attestations → resolve. The three
 * attestations set up BOTH substance postures in one run:
 *
 *   - PROVENANCE (buyer): content = the committed section's ABI encoding,
 *     PUBLISHED — pinned to Kubo as a raw block multihashed keccak-256, so
 *     the on-chain `contentRef` IS the content address. This is what makes
 *     the process ATTRIBUTABLE: the market-shape layer keys on the decoded
 *     `compositionHash` field (declared by spec, never by clause name).
 *   - GEOLOCATION (seller): content published the same way — the geo clause
 *     family draws a DECODED overlay row.
 *   - DATA-TERMS (seller): content NOT published — the anchors are real, the
 *     substance is withheld, and the family renders FINGERPRINT-ONLY.
 *
 * Asserted, every expectation derived OUT-OF-BAND (viem event scans, token
 * contract reads, gateway round-trips, `computeClauseKey` over the REGISTERED
 * specs) — never from the screen that claims to have written it:
 *
 *   - market shape: the seeded assembly's row shows exactly the process /
 *     order / pair counts and the committed + settled volume the chain
 *     reports for the processes whose PUBLISHED provenance decodes to its
 *     compositionHash;
 *   - overlays: the expected row keys are computed with `computeClauseKey`
 *     from the registered specs; every rendered row's key exists on chain;
 *     the geo family shows its out-of-band decoded count, the data-terms
 *     family shows fingerprint-only (its refs verified UNSERVED at the
 *     gateway);
 *   - value flow: the settlement denomination node carries the token
 *     contract's own symbol and the event-folded process/settled-order
 *     counts; the composed-venue posture states ABSENCE OF A READER (the
 *     deployment records a venue; no corridor parser is configured) rather
 *     than an empty table;
 *   - wallet record: the seeded buyer's summary and rows equal its
 *     out-of-band order set; a never-used wallet reads as an ANSWERED
 *     absence, not an error;
 *   - every layer heading names its truth boundary;
 *   - the analyst prompt box does not exist when no endpoint is configured
 *     (the devnet ships `NEXT_PUBLIC_ANALYST_URL` deliberately empty).
 *
 * TWO FURTHER LEGS ride the same seeded record:
 *
 *   - THE ANALYST LEG: the real analyst runnable
 *     (`ecosystem-agents/runtime/figaro-analyst.mjs`) is started against this
 *     devnet — spawned per-spec, AFTER the seed, so its one boot sync holds
 *     the whole record (a suite-level webServer entry would sync before the
 *     seed exists) — and its deterministic routes are held to the same
 *     out-of-band folds. The UI half: the endpoint is configured through the
 *     REAL endpoints form (never a localStorage preseed), and the prompt box
 *     appears. The box's ask path IS the model loop, and this host configures
 *     no model — so the box must state the host's own reason instead of
 *     pretending to answer, and the deterministic ANSWERS are asserted over
 *     the analyst's own wire against chain facts.
 *
 *   - THE BATCH-UNIVERSE LEG: one `settleBatch` on the devnet's
 *     `FigaroBatchVerifier` (its `MockSP1Verifier` accepts any proof — the
 *     documented devnet posture) re-emits a real `Attestation` from the
 *     verifier's own address for a process the kernel never saw. The two
 *     emitters share one topic hash, so the EMITTING ADDRESS is the only
 *     thing that says which universe a row came from — the explorer's fold
 *     must discriminate by address, and the geo family's row must read
 *     "direct + batch settlements". The seed is honest about what it shows:
 *     the reader's address-discriminated fold, not proof integrity (the mock
 *     accepts everything; the state root it advances to is arbitrary).
 *
 * Wallets: two DEDICATED keys derived by keccak from this spec's own label —
 * outside the anvil index namespace entirely (no `--accounts` dependency, no
 * allocation-table entry to claim; the payout-routing earmark precedent).
 * They sign only in Node, self-fund ETH from anvil[0], self-mint MOCK. Fresh
 * salts per run keep re-runs idempotent; nothing snapshots or reverts, and
 * every deadline rides CHAIN time.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo.
 */
import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import * as path from 'path';
import {
    bytesToHex,
    createWalletClient,
    decodeAbiParameters,
    encodeAbiParameters,
    encodePacked,
    formatUnits,
    hexToBytes,
    http,
    keccak256,
    parseAbi,
    parseEther,
    stringToHex,
    toHex,
    zeroHash,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    ASSEMBLY_REGISTRY_ABI,
    ATTESTATION_COORDINATOR_ABI,
    CLAUSE_REGISTRY_ABI,
    buildSectionInclusionProof,
    calculateBonds,
    computeClauseKey,
    generateSalt,
    reconstructOrdersFromTemplate,
    sectionDataHash,
    templateCompositionHash,
    type AssemblyTemplate,
    type ReconstructedOrder,
} from '@figaro-protocol/sdk';
import { decodeContentFromSpec, encodeContentFromSpec, parseClauseSpec, type ClauseSpec } from '@figaro-protocol/sdk/clauses';
import { LOCAL_ANVIL, RPC_URL, localPublicClient, readLocalDeploymentConfig } from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';

const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)',
    'function mint(address, uint256) returns ()',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
]);

// ── This spec's DEDICATED wallets: keys derived from the spec's own label
//    (the payout-routing earmark-derivation precedent) — deterministic across
//    runs, outside the anvil index namespace, self-funded in-spec. Their
//    identities are this test's INPUT DATA (an authoring act).
const SURVEYOR_KEY = keccak256(stringToHex('data-explore.devnet.spec.ts:surveyor'));
const CLIENT_KEY = keccak256(stringToHex('data-explore.devnet.spec.ts:client'));

// The clauses this scenario attests (seed-time authoring inputs — the
// ASSERTIONS never name them: expected overlay keys are computed out-of-band
// with computeClauseKey over the registered specs).
const PROVENANCE = 'figaro-assembly-provenance';
const GEO = 'figaro-geolocation';
const DATA_TERMS = 'figaro-data-terms';
const CREDENTIAL = 'figaro-credential';

// CIDv1 [raw 0x55, keccak-256 0x1b, len 32], multibase base16 — appending the
// fingerprint's hex yields the content address any reader derives from the
// Attestation event alone (the witnessContent seam, mirrored out-of-band).
const KECCAK_RAW_CID_PREFIX = 'f01551b20';
const witnessCid = (contentRef: string) => KECCAK_RAW_CID_PREFIX + contentRef.slice(2).toLowerCase();

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ── The out-of-band substance seam, shared by all three tests: pin / recover
//    witness bytes the way any stranger derives them from the event alone. ──
const IPFS_API = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
const GATEWAY = (process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

const pinWitnessBytes = async (content: Hex) => {
    const form = new FormData();
    form.append('file', new Blob([hexToBytes(content) as unknown as BlobPart]));
    const res = await fetch(
        `${IPFS_API}/api/v0/block/put?cid-codec=raw&mhtype=keccak-256&mhlen=-1&pin=true`,
        { method: 'POST', body: form },
    );
    expect(res.ok, `Kubo block/put accepted the witness bytes (${res.status})`).toBe(true);
};
const fetchWitnessBytes = async (contentRef: string): Promise<Hex | null> => {
    try {
        const res = await fetch(`${GATEWAY}/ipfs/${witnessCid(contentRef)}`);
        if (!res.ok) return null;
        const hex = bytesToHex(new Uint8Array(await res.arrayBuffer()));
        return keccak256(hex).toLowerCase() === contentRef.toLowerCase() ? hex : null;
    } catch {
        return null;
    }
};

test.describe('DATA EXPLORER — every layer of /data/explore against out-of-band chain facts (devnet)', () => {
    test.setTimeout(300_000);

    test('seed a settled geo-attested process with published + withheld substance, then hold every rendered layer to the record', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const clauseRegistry = config.clauseRegistry as Hex;
        const assemblyRegistry = config.assemblyRegistry as Hex;
        const batchVerifier = config.batchVerifier as Hex;
        expect(core && token && coordinator && clauseRegistry && assemblyRegistry && batchVerifier,
            'full deployment record (run ./scripts/deploy-local.sh)').toBeTruthy();

        const publicClient = localPublicClient();
        const receipt = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] });
        const surveyor = privateKeyToAccount(SURVEYOR_KEY);
        const client = privateKeyToAccount(CLIENT_KEY);
        const surveyorWallet = createWalletClient({ account: surveyor, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const clientWallet = createWalletClient({ account: client, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // ── SEED funding (idempotent): ETH by plain transfer from anvil[0] —
        //    how any new wallet arrives — and MOCK via the open mock mint. ──
        const funder = createWalletClient({
            account: privateKeyToAccount(ANVIL_KEYS[0] as Hex), chain: LOCAL_ANVIL, transport: http(RPC_URL),
        });
        for (const wallet of [surveyor, client]) {
            if ((await publicClient.getBalance({ address: wallet.address })) < parseEther('1')) {
                await receipt(await funder.sendTransaction({ to: wallet.address, value: parseEther('10') }));
            }
        }
        for (const [walletClient, account] of [[surveyorWallet, surveyor], [clientWallet, client]] as const) {
            if ((await balanceOf(account.address)) < parseEther('50')) {
                await receipt(await walletClient.writeContract({
                    address: token, abi: ERC20_ABI, functionName: 'mint', args: [account.address, parseEther('100')],
                }));
            }
        }

        // ── ADOPT from chain + IPFS: anchored templates resolved in full,
        //    integrity re-hashed, selected by SHAPE (single order composing
        //    the credential clause, the GEO clause, and the each-own
        //    data-terms regime) — never a hardcoded slug. ──
        const anchored: Array<{ compositionHash: Hex; template: AssemblyTemplate }> = [];
        for (const ev of await publicClient.getContractEvents({
            address: assemblyRegistry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered', fromBlock: 0n,
        })) {
            const { compositionHash, contentURI } = ev.args as { compositionHash?: Hex; contentURI?: string };
            if (!compositionHash || !contentURI) continue;
            try {
                const cid = contentURI.replace(/^ipfs:\/\//, '');
                const doc = await (await fetch(`${IPFS_API}/api/v0/cat?arg=${cid}`, { method: 'POST' })).json() as AssemblyTemplate;
                if (!Array.isArray(doc.agreements) || doc.agreements.length === 0) continue;
                anchored.push({ compositionHash, template: doc });
            } catch {
                continue; // unresolvable/garbage URI — mainnet-realistic tolerance
            }
        }
        const aerial = anchored.find((a) =>
            a.template.agreements.length === 1
            && CREDENTIAL in a.template.agreements[0].clauses
            && GEO in a.template.agreements[0].clauses
            && (a.template.agreements[0].clauses[DATA_TERMS] as { disclosure?: string } | undefined)?.disclosure === 'each-own');
        expect(aerial, 'the geo-bearing aerial-survey reference is anchored — run populate-test-data first').toBeTruthy();
        expect(templateCompositionHash(aerial!.template), 'the pinned template re-hashes to its anchored identity')
            .toBe(aerial!.compositionHash);
        const assemblyName = (aerial!.template as { name?: string }).name ?? '';
        expect(assemblyName, 'the anchored template carries its registered display name').not.toBe('');

        // ── The REGISTERED specs (ClauseRegistered → IPFS — the same read
        //    every consumer does). The expected overlay keys are DERIVED here
        //    with computeClauseKey, never assumed. ──
        const registrations = await publicClient.getContractEvents({
            address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered', fromBlock: 0n,
        });
        const registeredSpec = async (clauseId: string): Promise<ClauseSpec> => {
            const reg = registrations.filter((e) => e.args.clauseId === clauseId).pop();
            expect(reg, `${clauseId} is anchored on ClauseRegistry`).toBeTruthy();
            const cid = (reg!.args.contentURI as string).replace(/^ipfs:\/\//, '');
            const parsed = parseClauseSpec(await (await fetch(`${IPFS_API}/api/v0/cat?arg=${cid}`, { method: 'POST' })).json());
            if (!parsed.ok) throw new Error(`the registered ${clauseId} spec failed to parse`);
            return parsed.spec;
        };
        const provSpec = await registeredSpec(PROVENANCE);
        const geoSpec = await registeredSpec(GEO);
        const termsSpec = await registeredSpec(DATA_TERMS);
        const provKey = computeClauseKey(provSpec.clauseId, provSpec.version);
        const geoKey = computeClauseKey(geoSpec.clauseId, geoSpec.version);
        const termsKey = computeClauseKey(termsSpec.clauseId, termsSpec.version);

        // ── ONE bonded process through the SDK's ONE template walk: the
        //    client (buyer) books the surveyor (seller); value legs asserted
        //    from the token contract (the e2e value-legs rule). ──
        const chainNow = (await publicClient.getBlock({ blockTag: 'latest' })).timestamp;
        const orders = await reconstructOrdersFromTemplate(aerial!.template, {
            buyer: client.address,
            currency: token,
            chainId: LOCAL_ANVIL.id,
            core,
            nodes: () => ({
                seller: surveyor.address,
                payment: parseEther('1'),
                overrides: {
                    'figaro-commerce': {
                        currency: token,
                        payment: parseEther('1').toString(),
                        lineItems: [{ itemId: 'survey-flight', name: 'Aerial survey flight', quantity: 1, unitPrice: parseEther('1').toString() }],
                    },
                    'figaro-modalities': { modality: 'consume-onsite' },
                    'figaro-schedule': { windowStart: '2026-09-15T09:00:00Z', windowEnd: '2026-09-15T13:00:00Z' },
                    [GEO]: { geocodeStandard: 'geohash', origin: '9q8yyk', destination: '9q8yys' },
                    [CREDENTIAL]: {
                        credentialRegisterUri: 'https://uav-register.example/registrations{/id}',
                        credentialTitle: 'Remote pilot certificate',
                        credentialId: 'RPC-107-0077',
                    },
                    [DATA_TERMS]: { buyerDisclosure: 'permit' },
                    // Mechanical at checkout: the adopted assembly's own
                    // verified identity (fillProvenanceSection's write).
                    [PROVENANCE]: { compositionHash: aerial!.compositionHash },
                },
            }),
            salt: () => generateSalt(),
            deadline: chainNow + 3600n,
        });
        expect(orders, 'the aerial-survey reference is a single-order composition').toHaveLength(1);
        const order: ReconstructedOrder = orders[0];

        const buyerSig = await clientWallet.signTypedData(order.typedData);
        const sellerSig = await surveyorWallet.signTypedData(order.typedData);
        const { buyerBond, sellerBond } = calculateBonds(order.cumulativeValue, order.payment);
        const [buyer0, seller0, core0] = await Promise.all([
            balanceOf(client.address), balanceOf(surveyor.address), balanceOf(core),
        ]);
        await receipt(await clientWallet.writeContract({
            address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, buyerBond],
        }));
        await receipt(await surveyorWallet.writeContract({
            address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, sellerBond],
        }));
        const commitReceipt = await receipt(await clientWallet.writeContract({
            address: core, abi: CORE_ABI, functionName: 'commit', args: [order.commitment, buyerSig, sellerSig],
        }));
        expect(commitReceipt.status, 'the commit transaction succeeded').toBe('success');
        const committed = await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: client.address }, fromBlock: commitReceipt.blockNumber,
        });
        expect(committed, 'OrderCommitted lands on-chain').toHaveLength(1);
        const processId = committed[0].args.processId as Hex;
        const [buyer1, seller1, core1] = await Promise.all([
            balanceOf(client.address), balanceOf(surveyor.address), balanceOf(core),
        ]);
        expect(buyer1 - buyer0, 'buyer locked its 2× bond').toBe(-buyerBond);
        expect(seller1 - seller0, 'seller locked its 2× bond').toBe(-sellerBond);
        expect(core1 - core0, 'FigaroCore escrow holds both bonds').toBe(buyerBond + sellerBond);

        // ── THREE attestations, two substance postures. Content is the
        //    committed section's own values, ABI-encoded per the REGISTERED
        //    spec — decodable by any reader that recovers the bytes. ──
        const attestSection = async (opts: {
            verb: 'attestAsBuyer' | 'attestAsSeller';
            wallet: typeof clientWallet;
            spec: ClauseSpec;
            publish: boolean;
        }) => {
            const section = order.agreement.sections.find((s) => s.clause === opts.spec.clauseId);
            expect(section, `the agreement commits a ${opts.spec.clauseId} section`).toBeTruthy();
            const clauseKey = computeClauseKey(section!.clause, section!.version);
            const stage = 1;
            const content = encodeContentFromSpec(opts.spec, section!.data as Record<string, unknown>, { stage });
            const contentRef = keccak256(content);
            if (opts.publish) {
                await pinWitnessBytes(content);
                // Gateway round-trip: the fingerprint alone resolves the bytes.
                expect(await fetchWitnessBytes(contentRef), 'the published substance resolves from its own fingerprint')
                    .toBe(content);
            }
            const { proof } = buildSectionInclusionProof(order.agreement, section!.clause);
            const sectionHash = sectionDataHash(section!);
            if (opts.verb === 'attestAsSeller') {
                await receipt(await opts.wallet.writeContract({
                    address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, functionName: 'attestAsSeller',
                    args: [order.commitment, order.commitment, clauseKey, stage, sectionHash, proof, contentRef],
                }));
            } else {
                await receipt(await opts.wallet.writeContract({
                    address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, functionName: 'attestAsBuyer',
                    args: [order.commitment, clauseKey, stage, sectionHash, proof, contentRef],
                }));
            }
            const landed = await publicClient.getContractEvents({
                address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation',
                args: { processId }, fromBlock: commitReceipt.blockNumber,
            });
            expect(
                landed.some((log) =>
                    (log.args.clauseId as string).toLowerCase() === clauseKey.toLowerCase()
                    && (log.args.contentRef as string).toLowerCase() === contentRef.toLowerCase()),
                `the ${opts.spec.clauseId} attestation landed with its content fingerprint`,
            ).toBe(true);
            return { clauseKey, contentRef, content };
        };
        // The buyer's provenance attestation — the public attribution link.
        const provAttested = await attestSection({ verb: 'attestAsBuyer', wallet: clientWallet, spec: provSpec, publish: true });
        expect(provAttested.clauseKey, 'the committed provenance section keys as the registered spec').toBe(provKey);
        // The seller's geo attestation — published: the decoded overlay leg.
        const geoAttested = await attestSection({ verb: 'attestAsSeller', wallet: surveyorWallet, spec: geoSpec, publish: true });
        expect(geoAttested.clauseKey).toBe(geoKey);
        // The seller's data-terms attestation — WITHHELD: fingerprint-only.
        const termsAttested = await attestSection({ verb: 'attestAsSeller', wallet: surveyorWallet, spec: termsSpec, publish: false });
        expect(termsAttested.clauseKey).toBe(termsKey);

        // ── RESOLVE: net value legs from the token contract. ──
        await receipt(await clientWallet.writeContract({
            address: core, abi: CORE_ABI, functionName: 'resolveProcess',
            args: [processId, [order.commitment]],
        }));
        const [buyerF, sellerF, coreF] = await Promise.all([
            balanceOf(client.address), balanceOf(surveyor.address), balanceOf(core),
        ]);
        expect(buyer0 - buyerF, 'buyer net paid exactly the payment').toBe(order.payment);
        expect(sellerF - seller0, 'seller net earned exactly the payment').toBe(order.payment);
        expect(coreF, 'FigaroCore net 0 — escrow returned to baseline').toBe(core0);

        // ── OUT-OF-BAND EXPECTATIONS: fold the chain's own record the way a
        //    stranger would — raw event scans + gateway recovery + the
        //    registered specs. Nothing below reads the page. ──
        const [allCommitted, allResolved, allProcessResolved, directAttestations, batchAttestations] = await Promise.all([
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderCommitted', fromBlock: 0n }),
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderResolved', fromBlock: 0n }),
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'ProcessResolved', fromBlock: 0n }),
            publicClient.getContractEvents({ address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation', fromBlock: 0n }),
            // The batch verifier re-emits the SAME topic hash; the page's fold
            // is ADDRESS-DISCRIMINATED across both settlement universes, so
            // this out-of-band mirror must be too (the batch-universe leg
            // leaves real batch entries on the persisted devnet).
            publicClient.getContractEvents({ address: batchVerifier, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation', fromBlock: 0n }),
        ]);
        const allAttestations = [...directAttestations, ...batchAttestations];
        const resolvedOrderHashes = new Set(allResolved.map((e) => (e.args.orderHash as string).toLowerCase()));
        const resolvedProcessIds = new Set(allProcessResolved.map((e) => (e.args.processId as string).toLowerCase()));
        const onChainClauseKeys = new Set(allAttestations.map((e) => (e.args.clauseId as string).toLowerCase()));

        // Attribution: recover + decode every provenance-family payload.
        const attributionByProcess = new Map<string, string>();
        for (const ev of allAttestations) {
            if ((ev.args.clauseId as string).toLowerCase() !== provKey.toLowerCase()) continue;
            const bytes = await fetchWitnessBytes(ev.args.contentRef as string);
            if (!bytes) continue;
            const decoded = decodeContentFromSpec(provSpec, bytes, { stage: Number(ev.args.stage) }) as { compositionHash?: string };
            if (typeof decoded.compositionHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(decoded.compositionHash)) {
                attributionByProcess.set((ev.args.processId as string).toLowerCase(), decoded.compositionHash.toLowerCase());
            }
        }
        const marketKey = aerial!.compositionHash.toLowerCase();
        const marketProcessIds = new Set(
            [...attributionByProcess.entries()].filter(([, k]) => k === marketKey).map(([p]) => p),
        );
        expect(marketProcessIds.has(processId.toLowerCase()),
            'the seeded process is attributed to the adopted assembly by its PUBLISHED provenance alone').toBe(true);
        const marketOrders = allCommitted.filter((e) => marketProcessIds.has((e.args.processId as string).toLowerCase()));
        const marketPairs = new Set(marketOrders.map((e) => `${(e.args.buyer as string).toLowerCase()}→${(e.args.seller as string).toLowerCase()}`));
        let marketCommitted = 0n;
        let marketSettled = 0n;
        for (const e of marketOrders) {
            marketCommitted += e.args.payment as bigint;
            if (resolvedOrderHashes.has((e.args.orderHash as string).toLowerCase())) marketSettled += e.args.payment as bigint;
        }

        // The denomination's own metadata + event-folded node counts.
        const [symbol, decimals] = await Promise.all([
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }),
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }),
        ]);
        const tokenOrders = allCommitted.filter((e) => (e.args.currency as string).toLowerCase() === token.toLowerCase());
        const tokenProcessCount = new Set(tokenOrders.map((e) => (e.args.processId as string).toLowerCase())).size;
        const tokenSettledOrders = tokenOrders.filter((e) => resolvedOrderHashes.has((e.args.orderHash as string).toLowerCase())).length;

        // Overlay families: per-family entry + decoded counts, from the same
        // recovery walk the page performs — gateway + registered spec only.
        const familyCounts = async (key: Hex, spec: ClauseSpec) => {
            const entries = allAttestations.filter((e) => (e.args.clauseId as string).toLowerCase() === key.toLowerCase());
            let decoded = 0;
            for (const e of entries) {
                const bytes = await fetchWitnessBytes(e.args.contentRef as string);
                if (bytes === null) continue;
                try {
                    decodeContentFromSpec(spec, bytes, { stage: Number(e.args.stage) });
                    decoded += 1;
                } catch {
                    // undecodable bytes — fingerprint-only entry
                }
            }
            return { entries: entries.length, decoded };
        };
        const geoFold = await familyCounts(geoKey, geoSpec);
        const termsFold = await familyCounts(termsKey, termsSpec);
        expect(geoFold.decoded, 'at least the seeded geo payload recovers and decodes out-of-band').toBeGreaterThanOrEqual(1);
        expect(termsFold.entries, 'the data-terms family exists on chain').toBeGreaterThanOrEqual(1);
        expect(termsFold.decoded, 'no data-terms substance is served — the withheld posture holds out-of-band').toBe(0);

        // Wallet record fold for the seeded buyer.
        const clientBuyerOrders = allCommitted.filter((e) => (e.args.buyer as string).toLowerCase() === client.address.toLowerCase());
        const clientSellerOrders = allCommitted.filter((e) => (e.args.seller as string).toLowerCase() === client.address.toLowerCase());
        const clientProcesses = new Set(clientBuyerOrders.map((e) => (e.args.processId as string).toLowerCase()));
        const clientSettledProcesses = [...clientProcesses].filter((p) => resolvedProcessIds.has(p)).length;
        const clientDenominations = new Set(
            [...clientBuyerOrders, ...clientSellerOrders].map((e) => (e.args.currency as string).toLowerCase()),
        ).size;

        // ── THE PAGE. Walletless by construction: no provider injected, no
        //    account connected — the spectator posture is the surface. ──
        await page.goto('/data/explore');
        await expect(page.getByTestId('corpus-line'), 'the corpus read resolves').toBeVisible({ timeout: 60_000 });
        await expect(page.getByTestId('corpus-line')).toContainText('substance recovered for');

        // Market shape — boundary named, then the seeded assembly's row held
        // to the fold. The search narrowing by composition hash is the UI
        // action; the settled row is the reaction.
        await expect(page.getByTestId('layer-boundary')).toContainText('protocol-derived');
        await page.getByTestId('market-search').fill(marketKey);
        await expect(page.getByTestId('market-count')).toContainText('1 market attributed', { timeout: 60_000 });
        const marketRow = page.locator('li').filter({ hasText: assemblyName }).first();
        await expect(marketRow, 'the seeded assembly renders under its REGISTERED name').toBeVisible();
        await expect(marketRow).toContainText(
            `${plural(marketProcessIds.size, 'process', 'processes')} · ${plural(marketOrders.length, 'order', 'orders')} · ${plural(marketPairs.size, 'distinct buyer→seller pair', 'distinct buyer→seller pairs')}`,
        );
        await expect(marketRow, 'the settled volume equals the chain fold, in the token contract\'s own denomination').toContainText(
            `${formatUnits(marketSettled, Number(decimals))} ${symbol} settled of ${formatUnits(marketCommitted, Number(decimals))} ${symbol} committed`,
        );
        // The overlays THIS market draws — from what its processes attested.
        const marketOverlays = page.getByTestId(`market-overlays-${marketKey}`);
        await expect(marketOverlays).toContainText(geoSpec.clauseId);
        await expect(marketOverlays).toContainText(`${termsSpec.clauseId} (${termsFold.entries}, fingerprint-only)`);

        // ── CARRYING A PROCESS INTO THE AUDIT VIEW, from the DEFAULT layer ──
        // A reader arrives on `view=market` holding nothing: no wallet, no
        // processId. Before this the page could tell them 28 processes had
        // settled and give them no way to open one — the ids are derived from
        // the same events every figure above is derived from, so withholding
        // them was the surface's choice.
        //
        // The id is read OFF THE SCREEN and nothing here supplies it; the
        // chain fold is what it is then held to.
        const marketProcesses = page.getByTestId(`market-processes-${marketKey}`);
        await expect(marketProcesses, 'the market row lists the processes behind its count').toBeVisible();
        const listedProcessIds = await marketProcesses
            .locator('[data-testid^="process-audit-link-"]')
            .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
        expect(listedProcessIds.length, 'the market lists at least one openable process').toBeGreaterThanOrEqual(1);
        for (const listed of listedProcessIds) {
            // The FULL bytes32 is on the page — a truncation is not an id a
            // reader can record — and every one is a process the chain has.
            expect(listed, 'the listed id is a whole bytes32').toMatch(/^0x[0-9a-fA-F]{64}$/);
            expect(
                marketProcessIds.has(listed.toLowerCase()),
                `listed process ${listed} is one the chain attributes to this market`,
            ).toBe(true);
        }
        expect(
            listedProcessIds.map((id) => id.toLowerCase()),
            'the seeded process is among the ids the default layer offers',
        ).toContain(processId.toLowerCase());

        // The link's own href, then the click: the audit view opens the SAME
        // process the row named. href attribute, not a URL literal — the
        // static export's trailingSlash rewrites the path half.
        const auditLink = marketProcesses.getByTestId(`process-audit-link-${processId.toLowerCase()}`);
        await expect(auditLink).toHaveAttribute('href', new RegExp(`^/audit/view/?\\?process=${processId}$`, 'i'));
        await auditLink.click();
        await expect(page, 'the reader lands on the audit view for that process').toHaveURL(
            new RegExp(`/audit/view/?\\?process=${processId}`, 'i'),
        );
        await page.getByTestId('audit-page').waitFor({ timeout: 60_000 });
        await expect(
            page.getByTestId('financials-view'),
            'the audit view narrates the carried process for this walletless reader',
        ).toBeVisible({ timeout: 60_000 });
        await expect(
            page.getByTestId('financials-process-id'),
            'the process the audit view opened is the one the explorer row named',
        ).toHaveText(processId);
        await page.goBack();
        await expect(page.getByTestId('corpus-line')).toBeVisible({ timeout: 60_000 });
        await page.getByTestId('market-search').fill(marketKey);
        await expect(page.getByTestId('market-count')).toContainText('1 market attributed', { timeout: 60_000 });

        // Overlays — the open census. Every rendered key must exist on
        // chain; the seeded families show their out-of-band postures.
        await page.getByTestId('graph-view-overlays').click();
        await expect(page.getByTestId('layer-boundary')).toContainText('protocol-derived');
        const geoRow = page.getByTestId(`overlay-row-${geoKey}`);
        await expect(geoRow, 'the geo family draws its overlay row under its computed key').toBeVisible({ timeout: 60_000 });
        await expect(geoRow, 'the family resolves to its registered spec').toContainText(geoSpec.title);
        await expect(geoRow, 'the published substance renders DECODED, spec-routed').toContainText(
            `${geoFold.decoded} of ${plural(geoFold.entries, 'payload', 'payloads')} recovered and decoded`,
        );
        await expect(geoRow.getByTestId('overlay-fingerprint-only')).toHaveCount(0);
        const termsRow = page.getByTestId(`overlay-row-${termsKey}`);
        await expect(termsRow).toBeVisible();
        await expect(termsRow.getByTestId('overlay-fingerprint-only'),
            'the unpublished family renders fingerprint-only — absence, never a blank filled in').toBeVisible();
        const renderedKeys = await page.locator('[data-testid^="overlay-row-"]')
            .evaluateAll((els) => els.map((el) => (el.getAttribute('data-testid') ?? '').replace(/^overlay-row-/, '')));
        expect(renderedKeys.length).toBeGreaterThanOrEqual(2);
        for (const key of renderedKeys) {
            expect(onChainClauseKeys.has(key.toLowerCase()), `rendered overlay ${key} is an on-chain attestation family`).toBe(true);
        }

        // Value flow — the settlement denomination node with the token's own
        // metadata and event-folded counts; the venue posture states the
        // reader's absence, never an empty corridor table.
        await page.getByTestId('graph-view-value-flow').click();
        await expect(page.getByTestId('layer-boundary')).toContainText('composition-derived');
        const denomination = page.getByTestId(`denomination-${token.toLowerCase()}`);
        await expect(denomination, 'the settlement denomination node renders').toBeVisible({ timeout: 30_000 });
        await expect(denomination, 'the node carries the token contract\'s own symbol').toContainText(String(symbol));
        await expect(denomination).toContainText(
            `${plural(tokenProcessCount, 'process', 'processes')} · ${plural(tokenSettledOrders, 'settled order', 'settled orders')}`,
        );
        const venuePosture = page.getByTestId('venue-posture');
        if (config.swapRouter) {
            await expect(venuePosture, 'a composed venue with no corridor reader renders as labeled absence')
                .toContainText(`A swap venue is composed at ${config.swapRouter}`);
            await expect(venuePosture).toContainText('corridors are unreadable rather than empty');
        } else {
            await expect(venuePosture).toContainText('No swap venue is composed');
        }

        // Wallet record — the seeded buyer against its out-of-band order
        // set; then a never-used wallet as an ANSWERED absence.
        await page.getByTestId('graph-view-wallet').click();
        await expect(page.getByTestId('layer-boundary')).toContainText('protocol-enforced');
        await page.getByTestId('wallet-input').fill(client.address);
        const summary = page.getByTestId('wallet-summary');
        await expect(summary).toBeVisible({ timeout: 30_000 });
        await expect(summary).toContainText(
            `${plural(clientProcesses.size, 'process', 'processes')} resolved as root buyer (${clientSettledProcesses} settled) · `
            + `${plural(clientBuyerOrders.length, 'order', 'orders')} as buyer · `
            + `${plural(clientSellerOrders.length, 'order', 'orders')} as seller · `
            + `${plural(clientDenominations, 'denomination', 'denominations')}`,
        );
        await expect(
            // href attribute, not a URL literal: the static export's
            // trailingSlash rewrites the path half (`/audit/view/?process=…`).
            page.locator(`a[href*="process=${processId}"]`).first(),
            'the seeded order row hands off to the process record',
        ).toBeVisible();
        const unused = privateKeyToAccount(keccak256(stringToHex('data-explore.devnet.spec.ts:never-used')));
        await page.getByTestId('wallet-input').fill(unused.address);
        await expect(page.getByTestId('wallet-empty'), 'an unused wallet reads as an answer, not an error').toBeVisible();

        // The analyst prompt box exists ONLY when an endpoint is configured;
        // the devnet ships NEXT_PUBLIC_ANALYST_URL deliberately empty.
        if (process.env.NEXT_PUBLIC_ANALYST_URL) {
            await expect(page.getByTestId('analyst-prompt')).toBeVisible();
        } else {
            await expect(page.getByTestId('analyst-prompt'), 'no endpoint configured — no prompt box at all').toHaveCount(0);
        }

        test.info().annotations.push({
            type: 'DataExplorer',
            description: `process=${processId} market=${marketKey} geo=${geoKey} withheld=${termsKey}`,
        });
    });

    // ── THE ANALYST LEG ─────────────────────────────────────────────────────
    // The real runnable, spawned per-spec against this devnet AFTER the seed
    // (its one boot sync then holds the whole record — a suite-level webServer
    // entry would sync before the seed exists). Port: dedicated to this spec,
    // deliberately OFF the runnable's own 8620 default so a maintainer-run
    // analyst never collides with the harness.
    const ANALYST_PORT = 8621;
    const ANALYST_URL = `http://127.0.0.1:${ANALYST_PORT}`;
    const ANALYST_RUNTIME_DIR = path.resolve(__dirname, '../../../ecosystem-agents/runtime');
    const DEPLOYMENT_RECORD_PATH = path.resolve(__dirname, '../../../.deployments/local.json');

    interface AnalystStatusWire {
        chainId?: number;
        syncedToBlock?: string;
        orderCommitted?: number;
        orderResolved?: number;
        processResolved?: number;
        attestations?: number;
        attestationsByUniverse?: { direct?: number; batch?: number };
        substanceRecovered?: number;
        heldAgreements?: number;
        prompt?: { available?: boolean; reason?: string };
        routes?: string[];
    }

    test('the analyst leg — the deterministic routes answer to the chain facts, and the endpoints form surfaces the prompt box', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const batchVerifier = config.batchVerifier as Hex;
        expect(core && coordinator && batchVerifier,
            'full deployment record (run ./scripts/deploy-local.sh)').toBeTruthy();
        const publicClient = localPublicClient();

        // The port must be FREE: a stray analyst would serve a STALE corpus
        // and every equality below would test the wrong object.
        const portTaken = await fetch(`${ANALYST_URL}/status`).then(() => true).catch(() => false);
        expect(portTaken, `nothing else listens on :${ANALYST_PORT} — kill the stray process first`).toBe(false);

        // Spawn the runnable exactly as its header documents: RPC + deployment
        // record + local gateways (BOTH gateway vars pinned local — the
        // fallback otherwise defaults to the public ipfs.io). The model vars
        // are STRIPPED: this host deliberately configures no model, so the
        // /prompt loop must be absent whatever the harness shell exports.
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            RPC_URL,
            DEPLOYMENT_RECORD: DEPLOYMENT_RECORD_PATH,
            IPFS_GATEWAY_URL: GATEWAY,
            IPFS_FALLBACK_GATEWAY_URL: GATEWAY,
            FIGARO_ANALYST_PORT: String(ANALYST_PORT),
        };
        delete env.ANTHROPIC_API_KEY;
        delete env.ANTHROPIC_MODEL;
        delete env.FIGARO_ANALYST_CROSSCHECK_RPC_URLS;
        delete env.FIGARO_AGREEMENTS_DIR;
        delete env.FIGARO_ANALYST_FROM_BLOCK;
        const analyst = spawn(process.execPath, ['figaro-analyst.mjs'], {
            cwd: ANALYST_RUNTIME_DIR, env, stdio: ['ignore', 'ignore', 'pipe'],
        });
        let analystStderr = '';
        analyst.stderr.on('data', (d: Buffer) => { analystStderr += d.toString(); });

        try {
            const deadline = Date.now() + 120_000;
            let ready = false;
            while (Date.now() < deadline && !ready) {
                ready = await fetch(`${ANALYST_URL}/status`).then((r) => r.ok).catch(() => false);
                if (!ready) await new Promise((r) => setTimeout(r, 500));
            }
            expect(ready, `the analyst synced and answered /status — stderr:\n${analystStderr}`).toBe(true);

            // ── OUT-OF-BAND folds: the same raw event scans a stranger runs.
            //    Nothing below is read back from the analyst it checks. ──
            const [allCommitted, allResolved, allProcessResolved, directAtt, batchAtt] = await Promise.all([
                publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderCommitted', fromBlock: 0n }),
                publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderResolved', fromBlock: 0n }),
                publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'ProcessResolved', fromBlock: 0n }),
                publicClient.getContractEvents({ address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation', fromBlock: 0n }),
                publicClient.getContractEvents({ address: batchVerifier, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation', fromBlock: 0n }),
            ]);
            expect(allCommitted.length, 'a committed process exists — the seed test ran on this devnet').toBeGreaterThan(0);
            const resolvedProcessIds = new Set(allProcessResolved.map((e) => (e.args.processId as string).toLowerCase()));
            let recoveredFold = 0;
            for (const e of [...directAtt, ...batchAtt]) {
                if (await fetchWitnessBytes(e.args.contentRef as string) !== null) recoveredFold += 1;
            }

            // ── /status: the corpus is exactly the chain's own record. ──
            const status = await (await fetch(`${ANALYST_URL}/status`)).json() as AnalystStatusWire;
            expect(status.chainId, 'the corpus is this chain').toBe(LOCAL_ANVIL.id);
            expect(status.orderCommitted, 'commit count equals the event fold').toBe(allCommitted.length);
            expect(status.orderResolved).toBe(allResolved.length);
            expect(status.processResolved).toBe(allProcessResolved.length);
            expect(status.attestations, 'attestations span BOTH settlement universes').toBe(directAtt.length + batchAtt.length);
            expect(status.attestationsByUniverse?.direct, 'the direct universe is the coordinator\'s address').toBe(directAtt.length);
            expect(status.attestationsByUniverse?.batch, 'the batch universe is the verifier\'s address').toBe(batchAtt.length);
            expect(status.substanceRecovered, 'recovered substance equals the gateway fold').toBe(recoveredFold);
            expect(status.heldAgreements, 'a walletless analyst holds no agreement bodies').toBe(0);
            const maxEventBlock = [...allCommitted, ...directAtt, ...batchAtt]
                .reduce((m, e) => (e.blockNumber! > m ? e.blockNumber! : m), 0n);
            expect(BigInt(status.syncedToBlock ?? '0') >= maxEventBlock, 'the sync reached the newest event').toBe(true);
            expect(status.prompt?.available, 'no model configured — the loop is absent, honestly').toBe(false);
            expect(status.prompt?.reason).toContain('ANTHROPIC_API_KEY and ANTHROPIC_MODEL are both unset');
            expect(status.routes ?? []).not.toContain('POST /prompt');

            // ── The deterministic ANSWERS, held to the folds. The newest
            //    committed order names the wallet and process asked about. ──
            const latest = allCommitted[allCommitted.length - 1];
            const buyer = (latest.args.buyer as string).toLowerCase();
            const pid = (latest.args.processId as string).toLowerCase();

            const rec = await (await fetch(`${ANALYST_URL}/queries/wallet-record?wallet=${latest.args.buyer}`)).json() as {
                processesAsRootBuyer: Array<{ processId: string; resolved: boolean }>;
                ordersAsBuyer: Array<{ orderHash: string; payment: string }>;
            };
            const buyerOrders = allCommitted.filter((e) => (e.args.buyer as string).toLowerCase() === buyer);
            const buyerProcesses = new Set(buyerOrders.map((e) => (e.args.processId as string).toLowerCase()));
            expect(rec.processesAsRootBuyer.length, 'root-buyer processes equal the fold').toBe(buyerProcesses.size);
            expect(rec.ordersAsBuyer.length).toBe(buyerOrders.length);
            for (const e of buyerOrders) {
                const row = rec.ordersAsBuyer.find((r) => r.orderHash.toLowerCase() === (e.args.orderHash as string).toLowerCase());
                expect(row, `order ${e.args.orderHash} appears in the record`).toBeTruthy();
                expect(row!.payment, 'the payment leaves the wire as the chain\'s own amount, a decimal string')
                    .toBe((e.args.payment as bigint).toString());
            }
            const recProcess = rec.processesAsRootBuyer.find((p) => p.processId.toLowerCase() === pid);
            expect(recProcess, 'the asked-about process is in the record').toBeTruthy();
            expect(recProcess!.resolved).toBe(resolvedProcessIds.has(pid));

            const story = await (await fetch(`${ANALYST_URL}/queries/deal-story?process=${latest.args.processId}`)).json() as {
                found: boolean;
                settlement: { resolved: boolean; orders: Array<{ orderHash: string; payment: string; lockedBuyerBond: string; lockedSellerBond: string }> };
                overlays: Array<{ universe: string; clauseKey: string }>;
                heldAgreements: number;
                agreementBodies: string;
            };
            expect(story.found).toBe(true);
            const processOrders = allCommitted.filter((e) => (e.args.processId as string).toLowerCase() === pid);
            expect(story.settlement.orders.length).toBe(processOrders.length);
            for (const e of processOrders) {
                const row = story.settlement.orders.find((o) => o.orderHash.toLowerCase() === (e.args.orderHash as string).toLowerCase());
                expect(row).toBeTruthy();
                const { buyerBond, sellerBond } = calculateBonds(e.args.cumulativeValue as bigint, e.args.payment as bigint);
                expect(row!.payment).toBe((e.args.payment as bigint).toString());
                expect(row!.lockedBuyerBond, 'the story reports the kernel\'s own 2× bond arithmetic').toBe(buyerBond.toString());
                expect(row!.lockedSellerBond).toBe(sellerBond.toString());
            }
            expect(story.settlement.resolved).toBe(resolvedProcessIds.has(pid));
            const processAtt = { direct: directAtt, batch: batchAtt };
            for (const universe of ['direct', 'batch'] as const) {
                expect(
                    story.overlays.filter((o) => o.universe === universe).length,
                    `the story's ${universe}-universe overlay entries equal that address's fold`,
                ).toBe(processAtt[universe].filter((e) => (e.args.processId as string).toLowerCase() === pid).length);
            }
            expect(story.heldAgreements).toBe(0);
            expect(story.agreementBodies, 'the body is party-private and the story says so').toContain('party-private');

            const shape = await (await fetch(`${ANALYST_URL}/queries/market-shape`)).json() as {
                groups: unknown[]; unattributedProcessCount: number;
            };
            expect(shape.groups, 'no held agreements ⇒ no attributed groups — never a guessed bin').toEqual([]);
            expect(shape.unattributedProcessCount, 'every process on this chain is reported, unattributed')
                .toBe(new Set(allCommitted.map((e) => (e.args.processId as string).toLowerCase())).size);

            // ── THE UI HALF. The endpoint is configured through the REAL
            //    endpoints form — the honest path; never a storage preseed.
            //    Then the prompt box exists, names its analyst, and states
            //    the host's no-model posture in the host's own words. ──
            await page.goto('/members/edit/endpoints');
            await page.getByTestId('endpoints-analystUrl').fill(ANALYST_URL);
            await page.getByTestId('endpoints-save').click();
            await expect(page.getByTestId('endpoints-saved'), 'the form confirms the save').toBeVisible();

            await page.goto('/data/explore');
            await expect(page.getByTestId('corpus-line'), 'the deterministic views still read from the chain itself').toBeVisible({ timeout: 60_000 });
            const promptBox = page.getByTestId('analyst-prompt');
            await expect(promptBox, 'the prompt box exists once THIS BROWSER points at an analyst').toBeVisible({ timeout: 30_000 });
            await expect(promptBox).toContainText(ANALYST_URL);
            await expect(promptBox, 'the box reports the analyst\'s own synced block').toContainText(`synced to block ${status.syncedToBlock}`);
            // The ask path IS the model loop; this host configured none. The
            // box must say so in the host's own words — and never render a
            // question form that would pretend to answer from nothing.
            await expect(promptBox.getByTestId('analyst-no-prompt')).toBeVisible();
            await expect(promptBox.getByTestId('analyst-no-prompt')).toContainText('ANTHROPIC_API_KEY and ANTHROPIC_MODEL are both unset');
            await expect(promptBox.getByTestId('analyst-question')).toHaveCount(0);
        } finally {
            analyst.kill('SIGTERM');
        }
    });

    // ── THE BATCH-UNIVERSE LEG ──────────────────────────────────────────────
    const BATCH_VERIFIER_ABI = [
        { type: 'function', name: 'stateRoot', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
        {
            type: 'function', name: 'settleBatch', stateMutability: 'nonpayable',
            inputs: [
                { name: 'proof', type: 'bytes' },
                { name: 'publicValues', type: 'bytes' },
                {
                    name: 'positions', type: 'tuple[]', components: [
                        { name: 'token', type: 'address' }, { name: 'user', type: 'address' },
                        { name: 'deposit', type: 'uint256' }, { name: 'payout', type: 'uint256' },
                    ],
                },
                {
                    name: 'events', type: 'tuple', components: [
                        {
                            name: 'attestations', type: 'tuple[]', components: [
                                { name: 'orderHash', type: 'bytes32' }, { name: 'processId', type: 'bytes32' },
                                { name: 'attester', type: 'address' }, { name: 'clauseId', type: 'bytes32' },
                                { name: 'stage', type: 'uint8' }, { name: 'contentRef', type: 'bytes32' },
                            ],
                        },
                        {
                            name: 'specBindings', type: 'tuple[]', components: [
                                { name: 'clauseId', type: 'bytes32' }, { name: 'specHash', type: 'bytes32' },
                            ],
                        },
                    ],
                },
                {
                    name: 'usage', type: 'tuple', components: [
                        { name: 'period', type: 'uint8' }, { name: 'provenanceClause', type: 'bytes32' },
                        {
                            name: 'accruals', type: 'tuple[]', components: [
                                { name: 'clauseOrAssembly', type: 'bytes32' }, { name: 'c', type: 'uint64' }, { name: 'd', type: 'uint64' },
                            ],
                        },
                        { name: 'sellers', type: 'address[]' },
                    ],
                },
            ],
            outputs: [],
        },
        {
            type: 'event', name: 'BatchSettled', inputs: [
                { name: 'batchId', type: 'uint64', indexed: true },
                { name: 'prevStateRoot', type: 'bytes32', indexed: true },
                { name: 'newStateRoot', type: 'bytes32', indexed: true },
                { name: 'positionCount', type: 'uint256', indexed: false },
            ],
        },
    ] as const;

    test('the batch-universe leg — one mock-verified settleBatch, and the overlay row folds both universes by ADDRESS', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const clauseRegistry = config.clauseRegistry as Hex;
        const batchVerifier = config.batchVerifier as Hex;
        expect(core && coordinator && clauseRegistry && batchVerifier,
            'full deployment record (run ./scripts/deploy-local.sh)').toBeTruthy();
        const publicClient = localPublicClient();
        const receipt = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });

        // Any funded wallet may submit — settlement is permissionless. The
        // spec's surveyor submits and attests; self-funded as in the seed.
        const surveyor = privateKeyToAccount(SURVEYOR_KEY);
        const surveyorWallet = createWalletClient({ account: surveyor, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        if ((await publicClient.getBalance({ address: surveyor.address })) < parseEther('1')) {
            const funder = createWalletClient({
                account: privateKeyToAccount(ANVIL_KEYS[0] as Hex), chain: LOCAL_ANVIL, transport: http(RPC_URL),
            });
            await receipt(await funder.sendTransaction({ to: surveyor.address, value: parseEther('10') }));
        }

        // The REGISTERED geo spec (registry event → IPFS — the read every
        // consumer does); its computed key is the family the row folds under.
        const registrations = await publicClient.getContractEvents({
            address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered', fromBlock: 0n,
        });
        const geoReg = registrations.filter((e) => e.args.clauseId === GEO).pop();
        expect(geoReg, `${GEO} is anchored on ClauseRegistry — run populate-test-data first`).toBeTruthy();
        const geoCid = (geoReg!.args.contentURI as string).replace(/^ipfs:\/\//, '');
        const geoParsed = parseClauseSpec(await (await fetch(`${IPFS_API}/api/v0/cat?arg=${geoCid}`, { method: 'POST' })).json());
        if (!geoParsed.ok) throw new Error(`the registered ${GEO} spec failed to parse`);
        const geoSpec = geoParsed.spec;
        const geoKey = computeClauseKey(geoSpec.clauseId, geoSpec.version);

        // The verifier's open-world gate: the spec binding must be the exact
        // document the registry anchors for this clause key — read it live.
        const specHash = await publicClient.readContract({
            address: clauseRegistry,
            abi: parseAbi(['function contentHashOf(bytes32) view returns (bytes32)']),
            functionName: 'contentHashOf',
            args: [geoKey],
        });
        expect(specHash, 'the registry anchors a content hash for the geo clause').not.toBe(zeroHash);

        // A BATCH-ONLY process identity, fresh each run: batch-settled trade
        // acquires no kernel status and emits no kernel event — the two
        // settlement universes stay disjoint by construction.
        const salt = toHex(generateSalt(), { size: 32 });
        const processId = keccak256(encodePacked(['string', 'bytes32'], ['data-explore.devnet.spec.ts:batch-process', salt]));
        const orderHash = keccak256(encodePacked(['string', 'bytes32'], ['data-explore.devnet.spec.ts:batch-order', salt]));

        // PUBLISHED substance, same witness seam as the direct universe: the
        // section's ABI encoding per the registered spec, pinned so the
        // on-chain contentRef IS the content address.
        const stage = 1;
        const content = encodeContentFromSpec(
            geoSpec,
            { geocodeStandard: 'geohash', origin: '9q8yyk', destination: '9q8yys' },
            { stage },
        );
        const contentRef = keccak256(content);
        await pinWitnessBytes(content);
        expect(await fetchWitnessBytes(contentRef), 'the batch substance resolves from its own fingerprint').toBe(content);

        // Public values: 8 static ABI words. prevRoot must be the LIVE root
        // (it advances every settle — never hardcode genesis); newRoot is
        // whatever the values say, because the mock accepts any proof — the
        // devnet posture this leg is explicit about.
        const prevRoot = await publicClient.readContract({
            address: batchVerifier, abi: BATCH_VERIFIER_ABI, functionName: 'stateRoot',
        });
        const newRoot = keccak256(encodePacked(['bytes32', 'bytes32'], [prevRoot, salt]));
        const attestation = { orderHash, processId, attester: surveyor.address, clauseId: geoKey, stage, contentRef };
        // The packed layouts the contract re-derives and compares — the
        // settle transaction itself is the byte-equality gate (a wrong
        // packing reverts with a *HashMismatch).
        const attestationsHash = keccak256(encodePacked(
            ['bytes32', 'bytes32', 'address', 'bytes32', 'uint8', 'bytes32'],
            [orderHash, processId, surveyor.address, geoKey, stage, contentRef],
        ));
        const specBindingsHash = keccak256(encodePacked(['bytes32', 'bytes32'], [geoKey, specHash]));
        const emptyPositionsHash = keccak256('0x');
        const emptyUsageHash = keccak256(encodePacked(['uint8', 'bytes32', 'uint64', 'uint64'], [0, zeroHash, 0n, 0n]));
        const publicValues = encodeAbiParameters(
            [
                { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint64' }, { type: 'address' },
                { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' },
            ],
            [prevRoot, newRoot, BigInt(LOCAL_ANVIL.id), batchVerifier, emptyPositionsHash, attestationsHash, specBindingsHash, emptyUsageHash],
        );

        const settleReceipt = await receipt(await surveyorWallet.writeContract({
            address: batchVerifier, abi: BATCH_VERIFIER_ABI, functionName: 'settleBatch',
            args: [
                '0x', publicValues, [],
                { attestations: [attestation], specBindings: [{ clauseId: geoKey, specHash }] },
                { period: 0, provenanceClause: zeroHash, accruals: [], sellers: [] },
            ],
        }));
        expect(settleReceipt.status, 'the batch settled — every packed hash matched byte-for-byte').toBe('success');

        // ── OUT-OF-BAND: the settle landed, in the batch universe ONLY. ──
        expect(await publicClient.readContract({
            address: batchVerifier, abi: BATCH_VERIFIER_ABI, functionName: 'stateRoot',
        }), 'the state root advanced to the submitted newRoot').toBe(newRoot);
        const settled = await publicClient.getContractEvents({
            address: batchVerifier, abi: BATCH_VERIFIER_ABI, eventName: 'BatchSettled', fromBlock: settleReceipt.blockNumber,
        });
        expect(settled.some((e) => e.args.newStateRoot === newRoot && e.args.positionCount === 0n),
            'BatchSettled names this batch, zero token positions').toBe(true);
        const batchLanded = await publicClient.getContractEvents({
            address: batchVerifier, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation',
            args: { processId }, fromBlock: settleReceipt.blockNumber,
        });
        expect(batchLanded.some((e) =>
            (e.args.clauseId as string).toLowerCase() === geoKey.toLowerCase()
            && (e.args.contentRef as string).toLowerCase() === contentRef.toLowerCase()),
        'the verifier re-emitted the attestation from its own address').toBe(true);
        // Address discrimination is the ONLY universe marker: the same topic
        // hash at the coordinator holds nothing for this process, and the
        // kernel never saw it at all.
        expect(await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation',
            args: { processId }, fromBlock: 0n,
        })).toHaveLength(0);
        const kernelOrders = await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', fromBlock: 0n,
        });
        expect(kernelOrders.some((e) => (e.args.processId as string).toLowerCase() === processId.toLowerCase()),
            'a batch-settled process acquires no kernel record — the universes are disjoint').toBe(false);

        // ── The geo family's fold across BOTH universes, by address — the
        //    page's own discrimination, mirrored out-of-band. ──
        const [directGeoAll, batchGeoAll] = await Promise.all([
            publicClient.getContractEvents({ address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation', fromBlock: 0n }),
            publicClient.getContractEvents({ address: batchVerifier, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation', fromBlock: 0n }),
        ]);
        const geoOf = (events: typeof directGeoAll) =>
            events.filter((e) => (e.args.clauseId as string).toLowerCase() === geoKey.toLowerCase());
        const directGeo = geoOf(directGeoAll);
        const batchGeo = geoOf(batchGeoAll);
        expect(directGeo.length, 'the direct-universe geo seed exists — the seed test ran on this devnet').toBeGreaterThanOrEqual(1);
        expect(batchGeo.length).toBeGreaterThanOrEqual(1);
        const geoEntries = directGeo.length + batchGeo.length;
        let geoDecoded = 0;
        for (const e of [...directGeo, ...batchGeo]) {
            const bytes = await fetchWitnessBytes(e.args.contentRef as string);
            if (bytes === null) continue;
            try {
                decodeContentFromSpec(geoSpec, bytes, { stage: Number(e.args.stage) });
                geoDecoded += 1;
            } catch {
                // undecodable bytes — fingerprint-only entry
            }
        }
        expect(geoDecoded, 'the batch payload decodes out-of-band like any direct one').toBeGreaterThanOrEqual(2);

        // ── THE PAGE: one family row, both universes, named by address. ──
        await page.goto('/data/explore');
        await expect(page.getByTestId('corpus-line'), 'the corpus read resolves').toBeVisible({ timeout: 60_000 });
        await page.getByTestId('graph-view-overlays').click();
        const geoRow = page.getByTestId(`overlay-row-${geoKey}`);
        await expect(geoRow, 'the geo family draws ONE row under its computed key').toBeVisible({ timeout: 60_000 });
        await expect(geoRow, 'both settlement universes fold into the row, discriminated by emitting address')
            .toContainText('direct + batch settlements');
        await expect(geoRow, 'the entry count spans both universes').toContainText(plural(geoEntries, 'attestation', 'attestations'));
        await expect(geoRow, 'the decoded count includes the batch payload').toContainText(
            `${geoDecoded} of ${plural(geoEntries, 'payload', 'payloads')} recovered and decoded`,
        );

        test.info().annotations.push({
            type: 'BatchUniverse',
            description: `process=${processId} geo=${geoKey} verifier=${batchVerifier} newRoot=${newRoot}`,
        });
    });
});
