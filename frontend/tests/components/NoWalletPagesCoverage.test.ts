/**
 * Every page of `app/(app)` and `app/(tools)` is held to "the wallet signs; it
 * is never a login" (docs/FRONTEND.md § "Wallet-provider scope per route") by
 * a named case, or says why it has none.
 *
 * The routes are read from the directory tree at test time, never from a
 * kept list: a page added under either group fails here until it is placed.
 * Each route is one of:
 *
 * - `case`: a test renders the page's view with no wallet connected and its
 *   network read answering with content, and asserts the content shows and no
 *   prompt to connect stands in for it. The entry names the file and the
 *   case's title, and this test checks the file holds that title.
 * - `subject`: the page's subject is the connected wallet itself (an edit of
 *   its own registration); with no wallet it has no subject to read.
 * - `input`: the page reads the network only for what the visitor types or
 *   picks; before that it has nothing of the network's to show.
 * - `finding`: the page withholds content it read until a wallet connects.
 *   The failing case is held out of the tree; the entry says where the page
 *   does it.
 * - `open`: no case renders it here yet; the entry says why.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pageRouteSegments, routeOf } from "../lib/__fixtures__/sourceTree";

const ROOT = path.resolve(process.cwd());

type Coverage =
    | { kind: "case"; file: string; title: string }
    | { kind: "subject" | "input" | "finding" | "open"; why: string };

const NO_WALLET: Record<string, Coverage> = {
    "/audit": { kind: "input", why: "the hash verifier computes the hash of what the visitor pastes in the browser, with no read; its search mode runs over the connected wallet's own orders (useWalletOrders), so with no wallet it searches none; a process's audit opens walletless at /audit/view" },
    "/audit/view": { kind: "case", file: "tests/components/AppPagesReadStates.test.tsx", title: "no wallet, the read present: its content shows" },
    "/data/explore": { kind: "case", file: "tests/lib/graphCorpusBatchAttestations.test.tsx", title: "the page's corpus line and attestation layer show the count" },
    "/discover": { kind: "case", file: "tests/components/MemberDiscovery.test.tsx", title: "no wallet, read present: the registry's members show" },
    "/evidence-display": { kind: "case", file: "tests/components/AppPagesReadStates.test.tsx", title: "no wallet, the read present: its content shows" },
    "/members/agents": { kind: "input", why: "a form of the visitor's own endpoints, filled into the anonymous draft; it reads nothing from the network" },
    "/members/assemblies": { kind: "case", file: "tests/components/MemberPagesReadStates.test.tsx", title: "no wallet, read present: %s lists the registry's assemblies" },
    "/members/buyer": { kind: "case", file: "tests/components/MemberPagesReadStates.test.tsx", title: "no wallet, read present: %s lists the registry's assemblies" },
    "/members/catalog": { kind: "open", why: "what it reads (the item fields the bound assemblies' clauses ask for) follows the draft's bindings; no case fills a draft with a binding here" },
    "/members/edit/agents": { kind: "subject", why: "edits the connected wallet's own registration; its profile reads walletless at /s/view?seller=" },
    "/members/edit/assemblies": { kind: "subject", why: "edits the connected wallet's own registration; its profile reads walletless at /s/view?seller=" },
    "/members/edit/buyer": { kind: "subject", why: "edits the connected wallet's own registration; its profile reads walletless at /s/view?seller=" },
    "/members/edit/catalog": { kind: "subject", why: "edits the connected wallet's own registration; its catalog reads walletless at /s/view?seller=" },
    "/members/edit/endpoints": { kind: "input", why: "this browser's own endpoints, never pinned or published; it reads nothing from the network" },
    "/members/edit/identity": { kind: "subject", why: "edits the connected wallet's own registration; its profile reads walletless at /s/view?seller=" },
    "/members/endpoints": { kind: "input", why: "this browser's own endpoints, never pinned or published; it reads nothing from the network" },
    "/members/identity": { kind: "input", why: "a form filled into the anonymous draft; it reads a token's symbol only for an address the visitor enters" },
    "/members/manage": { kind: "subject", why: "the connected wallet's own registration; with no wallet the page sends the visitor to the wizard (components/members/MemberLanding.tsx)" },
    "/members/review": { kind: "case", file: "tests/components/OnboardingReviewNoWallet.test.tsx", title: "no wallet, read present: the draft's name and item and the registration stake show" },
    "/orders": { kind: "case", file: "tests/components/OrdersListFailedRead.test.tsx", title: "no wallet, read present: the named wallet's orders show" },
    "/orders/view": { kind: "case", file: "tests/components/OrderTimelineResolvedBothPaths.test.tsx", title: "no wallet, read present: a visitor with no wallet reads the order" },
    "/rewards": { kind: "case", file: "tests/components/RewardsViewNoWallet.test.tsx", title: "no wallet, read present: each period's budget, minted figure, total score and phase show" },
    "/s/checkout": { kind: "case", file: "tests/components/CheckoutViewRefusedRow.test.tsx", title: "no wallet, read present: the cart, each order's seller and payment and the totals show" },
    "/s/view": { kind: "case", file: "tests/components/MemberDetailViewCartFigures.test.tsx", title: "no wallet, read present: the seller's name and catalog show" },
    "/sign": { kind: "case", file: "tests/components/SignPageFlow.test.tsx", title: "no wallet, read present: the linked order's token, payment and terms check show" },
    "/assemblies/designer": { kind: "case", file: "tests/components/RegistryListStateNoWallet.test.tsx", title: "%s, a named address: its rows show, read-only, and no hint to connect stands in for them" },
    "/assemblies/designer/edit": { kind: "open", why: "the canvas holds a draft from this browser's storage; its one network read is the clause registry, read when the agreement drawer opens, and no case renders the canvas with no wallet" },
    "/assemblies/designer/new": { kind: "open", why: "as /assemblies/designer/edit: a local draft, and the clause registry read when the drawer opens" },
    "/assemblies/designer/view": { kind: "case", file: "tests/components/ViewAssemblyClientFailedRead.test.tsx", title: "no wallet, read present: the published assembly's name shows" },
    "/clauses/register": { kind: "case", file: "tests/components/RegistryListStateNoWallet.test.tsx", title: "%s, a named address: its rows show, read-only, and no hint to connect stands in for them" },
};

/** Every page route of the two wallet groups, read from the tree. */
const walletRoutes = (): string[] => pageRouteSegments(path.join(ROOT, "app"), ["(app)", "(tools)"]).map(routeOf).sort();

describe("every wallet-tier page is held to 'the wallet is never a login', or says why not", () => {
    it("each route of app/(app) and app/(tools) has exactly one entry", () => {
        expect(Object.keys(NO_WALLET).sort()).toEqual(walletRoutes());
    });

    it.each(Object.entries(NO_WALLET).filter(([, c]) => c.kind === "case"))("%s — its named case exists", (_route, c) => {
        const { file, title } = c as { file: string; title: string };
        expect(readFileSync(path.join(ROOT, file), "utf8")).toContain(title);
    });
});
