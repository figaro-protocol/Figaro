import { describe, expect, it } from "vitest";
import { listingClickThroughHref, sellerPageHref } from "@/lib/member/memberListing";
import type { Listing } from "@/lib/member/memberListing";

/**
 * One wallet, one public page, one place the route is written. The wizard's
 * review step promised a `/m/<address>` page that does not exist; the route
 * that does is this one, and prose that names it now interpolates the same
 * helper the links call, so a page cannot promise a route the site won't serve.
 */

const ADDRESS = "0x1cbd3b2770909d4e10f157cabc84c7264073c9ec";

describe("sellerPageHref — the public seller page", () => {
    it("routes a wallet to /s/view?seller=<address>", () => {
        expect(sellerPageHref(ADDRESS)).toBe(`/s/view?seller=${ADDRESS}`);
    });

    it("renders a placeholder in the same shape, for prose that names the route", () => {
        expect(sellerPageHref("<address>")).toBe("/s/view?seller=<address>");
    });

    it("is the same route a discover-card click goes to", () => {
        const listing = { address: ADDRESS, name: "Mara Oduya Ceramics" } as Listing;
        expect(listingClickThroughHref(listing)).toBe(sellerPageHref(ADDRESS));
    });
});
