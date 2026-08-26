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
import {
    bytesToHex,
    createWalletClient,
    decodeAbiParameters,
    formatUnits,
    hexToBytes,
    http,
    keccak256,
    parseAbi,
    parseEther,
    stringToHex,
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

test.describe('DATA EXPLORER — every layer of /data/explore against out-of-band chain facts (devnet)', () => {
    test.setTimeout(300_000);

    test('seed a settled geo-attested process with published + withheld substance, then hold every rendered layer to the record', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const clauseRegistry = config.clauseRegistry as Hex;
        const assemblyRegistry = config.assemblyRegistry as Hex;
        expect(core && token && coordinator && clauseRegistry && assemblyRegistry,
            'full deployment record (run ./scripts/deploy-local.sh)').toBeTruthy();

        const publicClient = localPublicClient();
        const receipt = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] });
        const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
        const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

        const surveyor = privateKeyToAccount(SURVEYOR_KEY);
        const client = privateKeyToAccount(CLIENT_KEY);
        const surveyorWallet = createWalletClient({ account: surveyor, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const clientWallet = createWalletClient({ account: client, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // ── The out-of-band read half: pin / recover witness bytes the way
        //    any stranger derives them from the event alone. ──
        const pinWitnessBytes = async (content: Hex) => {
            const form = new FormData();
            form.append('file', new Blob([hexToBytes(content) as unknown as BlobPart]));
            const res = await fetch(
                `${ipfsApi}/api/v0/block/put?cid-codec=raw&mhtype=keccak-256&mhlen=-1&pin=true`,
                { method: 'POST', body: form },
            );
            expect(res.ok, `Kubo block/put accepted the witness bytes (${res.status})`).toBe(true);
        };
        const fetchWitnessBytes = async (contentRef: string): Promise<Hex | null> => {
            try {
                const res = await fetch(`${gateway}/ipfs/${witnessCid(contentRef)}`);
                if (!res.ok) return null;
                const hex = bytesToHex(new Uint8Array(await res.arrayBuffer()));
                return keccak256(hex).toLowerCase() === contentRef.toLowerCase() ? hex : null;
            } catch {
                return null;
            }
        };

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
                const doc = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${cid}`, { method: 'POST' })).json() as AssemblyTemplate;
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
            const parsed = parseClauseSpec(await (await fetch(`${ipfsApi}/api/v0/cat?arg=${cid}`, { method: 'POST' })).json());
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
        const [allCommitted, allResolved, allProcessResolved, allAttestations] = await Promise.all([
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderCommitted', fromBlock: 0n }),
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderResolved', fromBlock: 0n }),
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'ProcessResolved', fromBlock: 0n }),
            publicClient.getContractEvents({ address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation', fromBlock: 0n }),
        ]);
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
});
