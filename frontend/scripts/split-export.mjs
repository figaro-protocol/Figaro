#!/usr/bin/env node
// split-export.mjs — one build, one static tree per host.
//
// `next build` exports the whole site into out/. This script reads the site
// map (lib/shared/sites.json — the one owner of which host serves which route)
// and writes out-sites/<site>/ for each site: every route's directory goes to
// the sites that carry it, and everything that is not a route (the _next/
// bundle, public assets at the root, 404.html) goes to every site. A route the
// map does not know fails the split, so nothing ships to no host.
//
//   node scripts/split-export.mjs [out] [out-sites]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "..", process.argv[2] ?? "out");
const DEST = path.resolve(here, "..", process.argv[3] ?? "out-sites");
const MAP = JSON.parse(fs.readFileSync(path.resolve(here, "../lib/shared/sites.json"), "utf8"));
const SITES = Object.keys(MAP.hosts);
const ROUTES = MAP.routes;
const ALIASES = MAP.aliases ?? [];

// The path a route is served at on a host: an alias renames a source route on
// one host (three FAQs under three names in the tree; each host serves its own
// at /faq); everything else keeps its own path. Query and hash ride along.
function servedPath(href, site) {
    const m = /^([^?#]*)(.*)$/.exec(href);
    const bare = (m?.[1] ?? href).replace(/\/$/, "") || "/";
    const rest = m?.[2] ?? "";
    for (const [source, aliasSite, served] of ALIASES) {
        if (aliasSite !== site) continue;
        if (bare === source) return served + rest;
        if (bare.startsWith(source + "/")) return served + bare.slice(source.length) + rest;
    }
    return href;
}

function sitesOfRoute(route) {
    let best;
    for (const entry of ROUTES) {
        const [prefix] = entry;
        const hit = prefix === "/" ? route === "/" : route === prefix || route.startsWith(prefix + "/");
        if (hit && (!best || prefix.length > best[0].length)) best = entry;
    }
    return best ? best[1] : [];
}

// Where a file goes is decided by the directory it sits in: `/a/b/index.html`
// and `/a/b/index.txt` (the page and its payload) belong to route "/a/b", and
// the typedoc's files under sdk-api/ belong to "/sdk-api". Only the _next/
// bundle and files at the export root are shared by every host. A page
// (index.html) in a directory the map does not know fails the split; other
// files in an unknown directory (an asset directory such as built-with/) go
// everywhere.
function placement(relFile) {
    const parts = relFile.split(path.sep);
    const dir = parts.slice(0, -1);
    const name = parts[parts.length - 1];
    if (dir.length === 0 || dir[0] === "_next" || dir[0] === "404") return { all: true };
    const route = "/" + dir.join("/");
    const sites = sitesOfRoute(route);
    if (sites.length > 0) return { sites, route };
    if (name === "index.html") return { unmapped: route };
    return { all: true };
}

if (!fs.existsSync(OUT)) {
    console.error(`[split-export] no export at ${OUT}; run next build first`);
    process.exit(1);
}
fs.rmSync(DEST, { recursive: true, force: true });

const files = [];
(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else files.push(path.relative(OUT, p));
    }
})(OUT);

const counts = Object.fromEntries(SITES.map((s) => [s, 0]));
const unmapped = [];
for (const rel of files) {
    const where = placement(rel);
    if (where.unmapped) { unmapped.push(where.unmapped); continue; }
    const targets = where.all ? SITES : where.sites;
    const isHtml = rel.endsWith(".html");
    const html = isHtml ? fs.readFileSync(path.join(OUT, rel), "utf8") : null;
    for (const site of targets) {
        // A renamed route lands under its served path on that host.
        // rel has no leading slash, so route.length covers "dir/" exactly.
        const dest = where.route ? path.join(servedPath(where.route, site).slice(1), rel.slice(where.route.length)) : rel;
        const to = path.join(DEST, site, dest);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        if (isHtml) fs.writeFileSync(to, rehost(html, site));
        else fs.copyFileSync(path.join(OUT, rel), to);
        counts[site] += 1;
    }
}

// The pages resolve their own links through components/shared/Link. Static
// HTML the export merely carries (the typedoc under sdk-api/, any raw anchor)
// does not, so as a file lands on a host, every in-tree link to a route that
// host does not carry is made absolute to the route's owner. A link the host
// carries is left alone.
function rehost(html, site) {
    return html.replace(/href="(\/[^"\/][^"]*|\/)"/g, (whole, href) => {
        if (href.startsWith("/_next")) return whole;
        const route = (href.split(/[?#]/)[0] || "/").replace(/\/$/, "") || "/";
        const sites = sitesOfRoute(route);
        if (sites.length === 0) return whole;
        if (sites.includes(site)) return `href="${servedPath(href, site)}"`;
        return `href="${MAP.hosts[sites[0]].replace(/\/$/, "")}${servedPath(href, sites[0])}"`;
    });
}

// Each host publishes its own sitemap: the export's one sitemap.xml, kept to
// the routes that host carries, with every URL on that host's origin.
const sitemapPath = path.join(OUT, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
    const xml = fs.readFileSync(sitemapPath, "utf8");
    const head = xml.slice(0, xml.indexOf("<url>"));
    const tail = xml.slice(xml.lastIndexOf("</url>") + "</url>".length);
    const entries = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);
    for (const site of SITES) {
        const origin = MAP.hosts[site].replace(/\/$/, "");
        const kept = entries
            .filter((e) => {
                const loc = /<loc>([^<]+)<\/loc>/.exec(e)?.[1] ?? "";
                const route = new URL(loc).pathname.replace(/\/$/, "") || "/";
                return sitesOfRoute(route).includes(site);
            })
            .map((e) => e.replace(/<loc>https?:\/\/[^/]+([^<]*)/, (_, p) => `<loc>${origin}${servedPath(p, site)}`));
        fs.writeFileSync(path.join(DEST, site, "sitemap.xml"), head + kept.join("") + tail);
        console.log(`[split-export] ${site}: sitemap.xml lists ${kept.length} routes on ${origin}`);
    }
}

if (unmapped.length > 0) {
    console.error(`[split-export] ${unmapped.length} route(s) the site map does not carry:`);
    for (const r of [...new Set(unmapped)].sort()) console.error(`  ${r}`);
    process.exit(1);
}
for (const site of SITES) console.log(`[split-export] ${site}: ${counts[site]} files → ${path.relative(process.cwd(), path.join(DEST, site))}`);
