/**
 * The deployment a page shows: named by the URL, else the build's own.
 *
 * A deployment is a chain id and a Core address. `resolvePageDeployment` is
 * the one rule that turns a URL's query into the deployment the page reads
 * and writes; these cases are that rule.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { chainById, chainNamed, deploymentOn, listedDeployments, pathNaming, resolvePageDeployment, searchNaming } from "@/lib/shared/chains";
import { PUBLISHED_RECORDS, type DeploymentRecord } from "@/lib/shared/deploymentRecords";

const CORE_A = "0x00000000000000000000000000000000000000Aa" as const;
const CORE_B = "0x00000000000000000000000000000000000000bB" as const;
const CORE_C = "0x00000000000000000000000000000000000000Cc" as const;

const build: DeploymentRecord = { chainId: 31337, figaroCore: CORE_A };
const published: DeploymentRecord[] = [{ chainId: 11155111, figaroCore: CORE_B }];
const resolve = (search: string, b = build, p = published) => resolvePageDeployment(search, b, p);

describe("the deployment a page shows", () => {
    it("is the build's own when the URL names none", () => {
        expect(resolve("")).toEqual({ kind: "build", named: false });
        expect(resolve("?process=0x01")).toEqual({ kind: "build", named: false });
    });

    it("is the build's own when the URL names its chain, with or without its Core", () => {
        expect(resolve("?chainID=31337")).toEqual({ kind: "build", named: true });
        expect(resolve(`?chainID=31337&coreAddress=${CORE_A.toLowerCase()}`)).toEqual({ kind: "build", named: true });
    });

    it("is a published record when the URL names that record's chain", () => {
        expect(resolve("?chainID=11155111")).toEqual({ kind: "published", record: published[0] });
        expect(resolve(`?process=0x01&chainID=11155111&coreAddress=${CORE_B}`)).toEqual({
            kind: "published",
            record: published[0],
        });
    });

    it("is unlisted when the URL names a Core no listed deployment has", () => {
        expect(resolve(`?chainID=31337&coreAddress=${CORE_C}`)).toEqual({ kind: "unlisted", chainId: 31337, core: CORE_C });
        expect(resolve(`?chainID=11155111&coreAddress=${CORE_A}`)).toEqual({
            kind: "unlisted",
            chainId: 11155111,
            core: CORE_A,
        });
    });

    it("is unlisted when the URL names a chain no listed deployment is on", () => {
        expect(resolve("?chainID=137")).toEqual({ kind: "unlisted", chainId: 137, core: null });
    });

    it("is unlisted when the chain id is not a positive integer, never the default", () => {
        for (const bad of ["abc", "-1", "0", "1.5", ""]) {
            expect(resolve(`?chainID=${bad}`)).toEqual({ kind: "unlisted", chainId: null, core: null });
        }
    });

    it("is the deployment a Core address alone names, and unlisted when no listed deployment has that Core", () => {
        expect(resolve(`?coreAddress=${CORE_A}`)).toEqual({ kind: "build", named: true });
        expect(resolve(`?coreAddress=${CORE_B.toLowerCase()}`)).toEqual({ kind: "published", record: published[0] });
        expect(resolve(`?processId=0x01&coreAddress=${CORE_C}`)).toEqual({ kind: "unlisted", chainId: null, core: CORE_C });
    });

    it("never shows a published record on a chain viem's registry does not know: its chain could not be signed for", () => {
        const UNKNOWN = 987_654_321_987;
        expect(chainById(UNKNOWN)).toBeUndefined();
        const unknownChain: DeploymentRecord[] = [{ chainId: UNKNOWN, figaroCore: CORE_B }];
        expect(resolve(`?chainID=${UNKNOWN}`, build, unknownChain)).toEqual({ kind: "unlisted", chainId: UNKNOWN, core: null });
        expect(resolve(`?coreAddress=${CORE_B}`, build, unknownChain)).toEqual({ kind: "unlisted", chainId: null, core: CORE_B });
        expect(listedDeployments(build, unknownChain)).toEqual([build]);
    });

    it("prefers the build's own deployment over a published record on the same chain", () => {
        const sameChain: DeploymentRecord[] = [{ chainId: 31337, figaroCore: CORE_B }];
        expect(resolve("?chainID=31337", build, sameChain)).toEqual({ kind: "build", named: true });
        expect(resolve(`?chainID=31337&coreAddress=${CORE_B}`, build, sameChain)).toEqual({
            kind: "published",
            record: sameChain[0],
        });
    });

    it("lists a build with no Core under its chain only when no published record is on it", () => {
        const unconfigured: DeploymentRecord = { chainId: 11155111, figaroCore: "" as `0x${string}` };
        expect(resolve("?chainID=11155111", unconfigured)).toEqual({ kind: "published", record: published[0] });
        expect(resolve("?chainID=11155111", unconfigured, [])).toEqual({ kind: "build", named: true });
    });
});

describe("the chain a build names", () => {
    it("is the devnet when the build names none", () => {
        expect(chainNamed(undefined).id).toBe(31337);
        expect(chainNamed("").id).toBe(31337);
    });

    it("is the chain viem's registry holds under that name", () => {
        expect(chainNamed("sepolia").id).toBe(11155111);
        expect(chainNamed("mainnet").id).toBe(1);
        expect(chainNamed("polygon").id).toBe(137);
        expect(chainNamed("polygonAmoy").id).toBe(80002);
    });

    it("stops on a name the registry does not hold, never falling back to the devnet", () => {
        expect(() => chainNamed("ethereum")).toThrow(/NEXT_PUBLIC_CHAIN/);
    });
});

describe("the published records the build carries", () => {
    it("are every record under deployments/, each on its own chain", () => {
        const onDisk = readdirSync(join(__dirname, "../../../deployments"))
            .filter((f) => /^\d+\.json$/.test(f))
            .map((f) => Number(f.replace(".json", "")))
            .sort((a, b) => a - b);
        const carried = PUBLISHED_RECORDS.map((r) => r.chainId).sort((a, b) => a - b);
        expect(carried).toEqual(onDisk);
        expect(new Set(carried).size).toBe(carried.length);
    });

    it("are each on a chain viem's registry knows, so the page can name and read it", () => {
        for (const record of PUBLISHED_RECORDS) expect(chainById(record.chainId)?.id).toBe(record.chainId);
    });
});

describe("the deployments a build lists", () => {
    it("are its own, when it has a Core, then the published ones", () => {
        expect(listedDeployments(build, published)).toEqual([build, published[0]]);
    });

    it("leave out a build with no Core, and name a deployment once", () => {
        const unconfigured: DeploymentRecord = { chainId: 31337, figaroCore: "" as `0x${string}` };
        expect(listedDeployments(unconfigured, published)).toEqual(published);
        const same: DeploymentRecord = { chainId: 11155111, figaroCore: CORE_B.toLowerCase() as `0x${string}`, rpcUrl: "https://own.example.com" };
        expect(listedDeployments(same, published)).toEqual([same]);
    });

    it("name the deployment a chain id alone names, or none", () => {
        expect(deploymentOn(31337, build, published)).toEqual(build);
        expect(deploymentOn(11155111, build, published)).toEqual(published[0]);
        expect(deploymentOn(137, build, published)).toBeNull();
    });
});

describe("a URL's query naming a deployment", () => {
    it("carries the chain id and the Core, and keeps every other parameter where it was", () => {
        expect(searchNaming("", build)).toBe(`?chainID=31337&coreAddress=${CORE_A}`);
        expect(searchNaming("?process=0x01&tab=evidence", build)).toBe(
            `?process=0x01&tab=evidence&chainID=31337&coreAddress=${CORE_A}`,
        );
    });

    it("renames the deployment in place and is the same when applied twice", () => {
        const once = searchNaming(`?chainID=31337&coreAddress=${CORE_A}&slug=asm-1`, published[0]);
        expect(once).toBe(`?chainID=11155111&coreAddress=${CORE_B}&slug=asm-1`);
        expect(searchNaming(once, published[0])).toBe(once);
    });

    it("stays on this site whatever the path: leading slashes never name another host", () => {
        expect(pathNaming("//evil.example/orders/", "?process=0x01", "#top", build)).toBe(
            `/evil.example/orders/?process=0x01&chainID=31337&coreAddress=${CORE_A}#top`,
        );
        expect(pathNaming("/orders/view/", "", "", build)).toBe(`/orders/view/?chainID=31337&coreAddress=${CORE_A}`);
    });

    it("resolves back to the deployment it names", () => {
        expect(resolve(searchNaming("?slug=asm-1", published[0]))).toEqual({ kind: "published", record: published[0] });
        expect(resolve(searchNaming("", build))).toEqual({ kind: "build", named: true });
    });
});
