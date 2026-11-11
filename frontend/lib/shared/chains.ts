import { defineChain, type Chain } from "viem";
import * as viemChains from "viem/chains";
import { isAddress } from "viem";
import { PUBLISHED_RECORDS, buildRecord, type DeploymentRecord } from "./deploymentRecords";

/** Anvil's default chainId — the single source for the devnet chain id. */
export const DEVNET_CHAIN_ID = 31337;

/**
 * Local Anvil chain — uses chainId 31337 to exactly match Anvil's default
 * and MetaMask's built-in "Hardhat" entry.  This prevents MetaMask v11+
 * from routing wallet_switchEthereumChain through the Snaps
 * network-management dialog, which would ask the user to authorize sending
 * information to third parties.  We name the chain "Localhost" so wallet UI
 * (and this app's own ChainGuard) displays it that way, while the underlying
 * chainId matches the MetaMask preset — no custom chain add required.
 */
export const localAnvil = defineChain({
    id: DEVNET_CHAIN_ID,
    name: "Localhost",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: ["http://127.0.0.1:8545"] },
    },
});


/**
 * The chain a build names in `NEXT_PUBLIC_CHAIN`: a key of viem's registry of
 * EVM networks (`mainnet`, `sepolia`, `polygon`, `polygonAmoy`, …), never a
 * list this build keeps. Unset, the local Anvil. A name the registry does not
 * hold stops the build: it never falls back to the devnet, which would point
 * a site built for a public network at 127.0.0.1.
 */
export function chainNamed(name: string | undefined): Chain {
    if (!name) return localAnvil;
    const chain = (viemChains as Record<string, unknown>)[name];
    if (typeof chain === "object" && chain !== null && "id" in chain) return chain as Chain;
    throw new Error(
        `NEXT_PUBLIC_CHAIN is "${name}", which names no chain in viem's registry — use the registry's key (mainnet, sepolia, polygon, polygonAmoy, …) or leave it unset for the devnet.`,
    );
}

/** The chain this build was configured for: the default a page shows when its URL names no deployment. */
export const buildChain = chainNamed(process.env.NEXT_PUBLIC_CHAIN);

// ── The deployment a page shows ─────────────────────────────────────────
//
// One site serves every deployment its build lists (`deploymentRecords.ts`).
// A page shows ONE of them, resolved once when the page loads, so the wagmi
// config still lists one chain and every signature is bound to that chain:
// the invariant the write path and the signing flow are built on. The URL
// names the deployment (`chainID`, and `coreAddress` to name it exactly, the
// two names `/evidence-display` already reads); a URL that names none shows
// the build's own. Moving to another deployment is a navigation that loads
// the page again.

/** The URL parameters that name a deployment. */
export const CHAIN_ID_PARAM = "chainID";
export const CORE_ADDRESS_PARAM = "coreAddress";

/** The deployment a page shows. `unlisted` is a URL naming a deployment this
 *  build does not list: the page then has no address to read or to write. */
export type PageDeployment =
    | { kind: "build"; named: boolean }
    | { kind: "published"; record: DeploymentRecord }
    | { kind: "unlisted"; chainId: number | null; core: string | null };

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A published deployment record the page can show: one on a chain viem's registry
 *  knows. The page signs for its deployment's chain, so a deployment record whose chain
 *  it cannot name is never shown with another chain beside its addresses. */
const showable = (record: DeploymentRecord) => chainById(record.chainId) !== undefined;

/** The rule: the deployment a URL's query names among `build` and `published`.
 *  A chain id alone names the build's own deployment when it is on that chain
 *  and has a Core, else the published deployment record on that chain. A Core address
 *  names a listed deployment exactly, with the chain id or alone; a URL that
 *  carries either parameter names a deployment, and is never read as naming
 *  none. */
export function resolvePageDeployment(
    search: string,
    build: DeploymentRecord,
    published: readonly DeploymentRecord[],
): PageDeployment {
    const query = new URLSearchParams(search);
    const rawChain = query.get(CHAIN_ID_PARAM);
    const core = query.get(CORE_ADDRESS_PARAM);
    if (rawChain === null && core === null) return { kind: "build", named: false };
    if (rawChain !== null && !/^[1-9]\d*$/.test(rawChain)) return { kind: "unlisted", chainId: null, core: null };
    const chainId = rawChain === null ? null : Number(rawChain);
    const onChain = published.filter((r) => showable(r) && (chainId === null || r.chainId === chainId));
    const buildOnChain = chainId === null || build.chainId === chainId;
    if (core !== null) {
        if (buildOnChain && sameAddress(build.figaroCore, core)) return { kind: "build", named: true };
        const exact = onChain.find((r) => sameAddress(r.figaroCore, core));
        return exact ? { kind: "published", record: exact } : { kind: "unlisted", chainId, core };
    }
    if (buildOnChain && isAddress(build.figaroCore, { strict: false })) return { kind: "build", named: true };
    if (onChain.length > 0) return { kind: "published", record: onChain[0] };
    return buildOnChain ? { kind: "build", named: true } : { kind: "unlisted", chainId, core: null };
}

/** The published deployment records this build lists beside its own. A devnet build
 *  lists none: the local chain stands in for a whole network, and a page of
 *  it never reaches out to a public one. */
const listedPublished: readonly DeploymentRecord[] = buildChain.id === DEVNET_CHAIN_ID ? [] : PUBLISHED_RECORDS;

const sameDeployment = (a: DeploymentRecord, b: DeploymentRecord) =>
    a.chainId === b.chainId && sameAddress(a.figaroCore, b.figaroCore);

/** The deployments this build lists: its own when it has a Core, then the
 *  published deployment records, a deployment named once (the build's own deployment record first:
 *  it carries the build's endpoint). */
export function listedDeployments(
    build: DeploymentRecord = buildRecord(buildChain.id),
    published: readonly DeploymentRecord[] = listedPublished,
): DeploymentRecord[] {
    const own = isAddress(build.figaroCore, { strict: false }) ? [build] : [];
    return [...own, ...published.filter((r) => showable(r) && !own.some((o) => sameDeployment(o, r)))];
}

/** The listed deployment a chain id alone names, as a URL carrying only
 *  `chainID` would resolve it; null when the build lists none on that chain. */
export function deploymentOn(
    chainId: number,
    build: DeploymentRecord = buildRecord(buildChain.id),
    published: readonly DeploymentRecord[] = listedPublished,
): DeploymentRecord | null {
    return listedDeployments(build, published).find((r) => r.chainId === chainId) ?? null;
}

/** `search` naming `record`: its chain id and its Core, every other parameter
 *  kept where it was. Applying it twice changes nothing. */
export function searchNaming(search: string, record: DeploymentRecord): string {
    const query = new URLSearchParams(search);
    query.set(CHAIN_ID_PARAM, String(record.chainId));
    query.set(CORE_ADDRESS_PARAM, record.figaroCore);
    return `?${query.toString()}`;
}

/** A path on this site naming `record`. The path keeps one leading slash:
 *  a path that begins `//host` would be read as an address on another host. */
export function pathNaming(pathname: string, search: string, hash: string, record: DeploymentRecord): string {
    return `/${pathname.replace(/^\/+/, "")}${searchNaming(search, record)}${hash}`;
}

/** The address of the page the browser is on, naming `record`. */
export function hrefNaming(record: DeploymentRecord): string {
    const { pathname, search, hash } = window.location;
    return pathNaming(pathname, search, hash, record);
}

/** Show `record`'s deployment: load this page again at the address naming it.
 *  A page shows one deployment for its whole life, so moving is a navigation. */
export function showDeployment(record: DeploymentRecord): void {
    window.location.assign(hrefNaming(record));
}

/** The deployment this page shows, resolved once from the URL the page was
 *  loaded at. With no window (the build's prerender) it is the build's own. */
export const pageDeployment: PageDeployment = resolvePageDeployment(
    typeof window === "undefined" ? "" : window.location.search,
    buildRecord(buildChain.id),
    listedPublished,
);

/** The deployment record of the deployment this page shows, or null when the URL names
 *  one this build does not list. The build's own deployment record is read at call time. */
export function pageRecord(): DeploymentRecord | null {
    if (pageDeployment.kind === "published") return pageDeployment.record;
    return pageDeployment.kind === "build" ? buildRecord(buildChain.id) : null;
}

/** The chain the page reads and writes: its deployment's (a published deployment record
 *  is shown only on a chain the registry knows, `showable`). A page whose URL
 *  names an unlisted deployment has nothing to read or write, and keeps the
 *  build's chain for the wallet configuration. */
export const activeChain: Chain =
    (pageDeployment.kind === "published" && chainById(pageDeployment.record.chainId)) || buildChain;

/**
 * The chain a wallet is on, read from viem's registry of EVM networks by its
 * id: its name and whether it is a test network come from that definition
 * (`testnet: true` on Sepolia, Polygon Amoy and every other test network viem
 * knows), never from a list this build keeps. The devnet (31337) is the local
 * chain above. A chain the registry does not know resolves to nothing, and a
 * surface then says nothing about it.
 */
export function chainById(id: number): Chain | undefined {
    if (id === DEVNET_CHAIN_ID) return localAnvil;
    for (const c of Object.values(viemChains)) {
        if (typeof c === "object" && c !== null && "id" in c && (c as Chain).id === id) return c as Chain;
    }
    return undefined;
}
