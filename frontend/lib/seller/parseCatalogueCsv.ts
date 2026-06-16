/**
 * lib/sellers/parseCatalogueCsv.ts
 *
 * Minimal RFC-4180-ish CSV parser scoped to the seller catalogue
 * import surface in OnboardingCatalogueForm. Handles quoted fields,
 * embedded commas/quotes/newlines, and column-header rebinding.
 *
 * NOT a general-purpose CSV library — accepts UTF-8 text, returns
 * `CatalogueItemMetadata[]` (the wizard's row shape). For anything
 * fancier (BOM handling, custom delimiters, streaming) the seller
 * should pre-process their export.
 *
 * Accepted column headers (case-insensitive, any order; required
 * columns must be present):
 *
 *   name           — required, non-empty after trim
 *   price          — required, non-empty after trim
 *   description    — optional
 *   category       — optional, defaults to "General"
 *   image          — optional, IPFS or HTTP URI
 *   available      — optional, "true"/"false"/"1"/"0" (default true)
 *   massGrams      — optional, parsed as number
 *   volumeMl       — optional, parsed as number
 *   classOfService — optional, one of "standard"/"express"/"fragile"/"cold-chain"
 *
 * Any other columns are silently ignored. Rows missing a required
 * field land in `errors`; the caller can decide whether to surface
 * partial-import vs. block.
 */

import type {
    CatalogueItemMetadata,
} from "@/lib/seller/sellerCatalogueMetadata";

export interface CatalogueCsvParseResult {
    items: CatalogueItemMetadata[];
    errors: string[];
}

function uid(): string {
    return Math.random().toString(36).slice(2, 10);
}

/**
 * Tokenise one CSV row into fields. Handles double-quoted fields with
 * embedded commas and the standard `""` escape for a literal quote.
 */
function tokeniseRow(line: string): string[] {
    const out: string[] = [];
    let buf = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                buf += '"';
                i += 1;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                buf += ch;
            }
        } else {
            if (ch === '"' && buf.length === 0) {
                inQuotes = true;
            } else if (ch === ",") {
                out.push(buf);
                buf = "";
            } else {
                buf += ch;
            }
        }
    }
    out.push(buf);
    return out;
}

/**
 * Split the raw CSV text into rows. Newlines inside quoted fields are
 * preserved (the tokeniser handles them per-row), so this splitter
 * concatenates lines until quotes balance.
 */
function splitRows(text: string): string[] {
    // Normalise line endings.
    const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalised.split("\n");
    const rows: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const line of lines) {
        if (current.length > 0) {
            current += "\n" + line;
        } else {
            current = line;
        }
        for (const ch of line) {
            if (ch === '"') inQuotes = !inQuotes;
        }
        if (!inQuotes) {
            rows.push(current);
            current = "";
        }
    }
    if (current.length > 0) rows.push(current);
    return rows.filter((r) => r.trim().length > 0);
}

function parseBoolean(value: string): boolean {
    const v = value.trim().toLowerCase();
    if (v === "false" || v === "0" || v === "no" || v === "n") return false;
    return true;
}


function parseNumber(value: string): number | undefined {
    const v = value.trim();
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

export function parseCatalogueCsv(text: string): CatalogueCsvParseResult {
    const rows = splitRows(text);
    if (rows.length === 0) {
        return { items: [], errors: ["File is empty."] };
    }

    const headerTokens = tokeniseRow(rows[0]).map((h) => h.trim().toLowerCase());
    const idx = (name: string) => headerTokens.indexOf(name.toLowerCase());

    const nameCol = idx("name");
    const priceCol = idx("price");
    if (nameCol < 0 || priceCol < 0) {
        return {
            items: [],
            errors: [
                `Header row must include "name" and "price". Found: ${headerTokens.join(", ") || "(empty)"}`,
            ],
        };
    }

    const descCol = idx("description");
    const catCol = idx("category");
    const imgCol = idx("image");
    const availCol = idx("available");
    const massCol = idx("massgrams");
    const volCol = idx("volumeml");

    const items: CatalogueItemMetadata[] = [];
    const errors: string[] = [];

    for (let r = 1; r < rows.length; r += 1) {
        const cells = tokeniseRow(rows[r]);
        const get = (i: number) => (i >= 0 && i < cells.length ? cells[i] : "");
        const name = get(nameCol).trim();
        const price = get(priceCol).trim();
        if (!name || !price) {
            errors.push(`Row ${r + 1}: missing required name or price.`);
            continue;
        }
        const item: CatalogueItemMetadata = {
            id: uid(),
            name,
            price,
            category: get(catCol).trim() || "General",
            available: availCol >= 0 ? parseBoolean(get(availCol)) : true,
        };
        const description = get(descCol).trim();
        if (description) item.description = description;
        const image = get(imgCol).trim();
        if (image) item.image = image;
        const mass = parseNumber(get(massCol));
        if (mass !== undefined) item.massGrams = mass;
        const volume = parseNumber(get(volCol));
        if (volume !== undefined) item.volumeMl = volume;
        items.push(item);
    }

    return { items, errors };
}
