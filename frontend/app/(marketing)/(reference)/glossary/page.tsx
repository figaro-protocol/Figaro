import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import { withOg } from "@/lib/shared/pageMetadata";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Lexicon — Figaro Protocol",
    description:
        "The one list of the protocol's nouns and their definitions, rendered from the repository's lexicon.",
});

interface Entry {
    id: string;
    noun: string;
    definition: string;
}

/** The page renders `docs/LEXICON.md` at build time. That file is the ONE
 *  list of nouns; this page holds no definitions of its own, so it cannot
 *  disagree with it. Each entry is one line of the form `**noun** — definition`;
 *  the anchor id is the noun's slug. */
function lexiconEntries(): Entry[] {
    const text = fs.readFileSync(path.join(process.cwd(), "../docs/LEXICON.md"), "utf-8");
    const entries: Entry[] = [];
    for (const line of text.split("\n")) {
        const match = /^\*\*(.+?)\*\*\s+—\s+(.+)$/.exec(line.trim());
        if (!match) continue;
        const noun = match[1];
        entries.push({
            id: noun.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
            noun,
            definition: match[2].replace(/`/g, ""),
        });
    }
    return entries;
}

export default function Glossary() {
    const entries = lexiconEntries();
    return (
        <>
            <MarketingHero
                title="Lexicon."
                lead={<>The protocol&rsquo;s nouns, one definition each. One name per thing.</>}
            />

            <MarketingSection bottomPad="wide">
                <dl className="space-y-6">
                    {entries.map(({ id, noun, definition }) => (
                        <div key={id} id={id} className="border-l-2 border-default pl-6 scroll-mt-24">
                            <dt className="text-base font-semibold text-ink-heading mb-1">{noun}</dt>
                            <dd className="text-sm text-ink-body leading-relaxed">{definition}</dd>
                        </div>
                    ))}
                </dl>
            </MarketingSection>
        </>
    );
}
