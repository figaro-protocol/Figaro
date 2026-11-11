"use client";

/**
 * PageDeployment — the page's deployment in the address bar and in the page.
 *
 * A page shows one deployment, resolved when it loads (`lib/shared/chains.ts`,
 * `pageDeployment`). Two things follow, both mounted by `<Providers>`:
 *
 * `PageDeploymentUrl` keeps the address naming that deployment (`chainID`,
 * `coreAddress`), so a copied link shows its reader the same deployment
 * whatever their wallet is on and whatever a later build's default is. It
 * also gives the wallet its say at entry: when the page was loaded at an
 * address naming no deployment and the wallet the browser restores is on
 * another chain the build lists a deployment on, the page moves there. A
 * wallet the visitor connects later never moves the page (a form may be
 * half filled; the wallet is a signer, connected last): `ChainGuard` then
 * offers the move.
 *
 * `PageDeploymentNotice` says what the wallet shell cannot derive: that the
 * address names a deployment this build does not list, where nothing is read
 * and nothing can be signed; and which other deployments the build lists.
 *
 * `/evidence-display` is the one route that reads what its link names, listed
 * or not, through the endpoint the link carries, and its link is a forum's,
 * never the visitor's: there the wallet never moves the page and the notice
 * is not shown (the page's own header states the deployment it reads).
 */

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useConnection } from "wagmi";
import {
    activeChain,
    chainById,
    deploymentOn,
    hrefNaming,
    listedDeployments,
    pageDeployment,
    pageRecord,
    searchNaming,
    showDeployment,
} from "@/lib/shared/chains";
import { hexEqual, isValidAddress } from "@/lib/shared/evm";
import { useMounted } from "@/hooks/useMounted";

/** The route whose link names everything it reads (`docs/FRONTEND.md` § "Deliberate orphan"). */
const readsWhatItsLinkNames = (pathname: string) => pathname.startsWith("/evidence-display");

function AddressNamesDeployment() {
    const pathname = usePathname();
    const query = useSearchParams();
    useEffect(() => {
        const record = pageRecord();
        if (!record || !isValidAddress(record.figaroCore)) return;
        // A null state is Next's own way in: its router takes the new address
        // as the page's, so `useSearchParams` and later navigations agree with it.
        if (searchNaming(window.location.search, record) !== window.location.search) {
            window.history.replaceState(null, "", hrefNaming(record));
        }
    }, [pathname, query]);
    return null;
}

function WalletAtEntryNamesDeployment() {
    const pathname = usePathname();
    const { status, chainId } = useConnection();
    // True until the visitor acts on the wallet: only the connection the
    // browser restores on its own is the wallet's say at entry.
    const atEntry = useRef(true);
    useEffect(() => {
        if (status === "connecting") atEntry.current = false;
        if (status !== "connected") return;
        const restored = atEntry.current;
        atEntry.current = false;
        if (!restored || pageDeployment.kind !== "build" || pageDeployment.named) return;
        if (readsWhatItsLinkNames(pathname)) return;
        if (chainId === undefined || chainId === activeChain.id) return;
        const target = deploymentOn(chainId);
        if (target) window.location.replace(hrefNaming(target));
    }, [status, chainId, pathname]);
    return null;
}

export function PageDeploymentUrl() {
    return (
        <>
            {/* `useSearchParams` leaves the prerender at its nearest Suspense boundary: this one, never the page. */}
            <Suspense fallback={null}>
                <AddressNamesDeployment />
            </Suspense>
            <WalletAtEntryNamesDeployment />
        </>
    );
}

export function PageDeploymentNotice() {
    // The address is the browser's: the prerender shows the build's own
    // deployment, so the notice waits for the client.
    const mounted = useMounted();
    const pathname = usePathname();
    if (!mounted) return null;
    const shown = pageRecord();
    const others = listedDeployments().filter(
        (r) => !shown || r.chainId !== shown.chainId || !hexEqual(r.figaroCore, shown.figaroCore),
    );
    // Two deployments on one chain are told apart by the head of their Core.
    const label = (record: (typeof others)[number]) => {
        const name = chainById(record.chainId)?.name ?? `chain ${record.chainId}`;
        const shared = listedDeployments().filter((r) => r.chainId === record.chainId).length > 1;
        return shared ? `${name} (Core ${record.figaroCore.slice(0, 10)}…)` : name;
    };
    const links = others.map((record) => (
        <a
            key={`${record.chainId}:${record.figaroCore}`}
            href={hrefNaming(record)}
            onClick={(event) => {
                event.preventDefault();
                showDeployment(record);
            }}
            className="underline"
        >
            {label(record)}
        </a>
    ));
    const also = links.length > 0 && (
        <span>
            {" "}
            This site lists: {links.reduce<React.ReactNode[]>((all, link, i) => (i === 0 ? [link] : [...all, ", ", link]), [])}.
        </span>
    );

    if (pageDeployment.kind === "unlisted") {
        if (readsWhatItsLinkNames(pathname)) return null;
        const { chainId, core } = pageDeployment;
        return (
            <div
                role="status"
                data-testid="unlisted-deployment-notice"
                className="bg-canvas border-y border-warning text-warning-fg text-sm py-2 px-4 text-center"
            >
                This address names a deployment this site does not list
                {(chainId !== null || core) && (
                    <>
                        {" ("}
                        {chainId !== null && <>chain {chainId}</>}
                        {chainId !== null && core && ", "}
                        {core && <>Core <span className="font-mono break-all">{core}</span></>}
                        {")"}
                    </>
                )}
                .
                Nothing is read from it here, and nothing can be signed on it.
                {also}
            </div>
        );
    }
    if (!also) return null;
    return (
        <p
            role="note"
            data-testid="listed-deployments-line"
            className="border-b border-default bg-subtle px-4 py-1 text-center text-xs text-ink-muted"
        >
            This page shows {activeChain.name}.{also}
        </p>
    );
}
