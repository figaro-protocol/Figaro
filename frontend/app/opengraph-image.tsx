import { ImageResponse } from "next/og";
// Satori renders these inline styles itself — it takes literal color strings,
// not Tailwind classes — so the card reads the palette module directly rather
// than duplicating its hexes (docs/DESIGN_TOKENS.md §8).
import { colorTokens } from "@/lib/shared/designTokenValues";

// No `runtime = "edge"` here: edge runtime disables static generation, so the
// static export would emit the <meta og:image> URL but never the image itself
// (a guaranteed 404 on every deploy — measured 2026-08-05). Default runtime
// lets `output: 'export'` render the PNG at build time.
//
// Every page references this one card: `withOg` points `openGraph.images` at
// the emitted `/opengraph-image` path, because a page-level `openGraph` block
// replaces the resolved parent block wholesale — pages relying on the file
// convention alone shipped no `og:image` at all. Palette + type follow
// docs/DESIGN_TOKENS.md (canvas / ink ramp / tawny-amber heading).
export const alt = "My word is my bond";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: colorTokens.canvas,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    padding: "80px 96px",
                    borderBottom: `16px solid ${colorTokens.ink.heading}`,
                }}
            >
                <div
                    style={{
                        fontSize: 96,
                        fontWeight: 700,
                        color: colorTokens.ink.heading,
                        letterSpacing: "-2px",
                        marginBottom: 28,
                    }}
                >
                    Figaro
                </div>
                <div
                    style={{
                        fontSize: 44,
                        fontWeight: 400,
                        color: colorTokens.ink.primary,
                        lineHeight: 1.35,
                        maxWidth: 950,
                    }}
                >
                    My word is my bond
                </div>
                <div
                    style={{
                        fontSize: 26,
                        fontWeight: 400,
                        color: colorTokens.ink.muted,
                        marginTop: 36,
                    }}
                >
                    Self-enforcing agreements between strangers — on Ethereum.
                </div>
            </div>
        ),
        { ...size },
    );
}
