import { ImageResponse } from "next/og";

// No `runtime = "edge"` here: edge runtime disables static generation, so the
// static export would emit the <meta og:image> URL but never the image itself
// (a guaranteed 404 on every deploy — measured 2026-08-05). Default runtime
// lets `output: 'export'` render the PNG at build time.
export const alt = "Figaro Protocol — The Figaro Ecosystem";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "system-ui, sans-serif",
                    padding: "60px 80px",
                }}
            >
                {/* Protocol name */}
                <div
                    style={{
                        fontSize: 72,
                        fontWeight: 800,
                        color: "#f8fafc",
                        letterSpacing: "-2px",
                        marginBottom: 24,
                    }}
                >
                    Figaro Protocol
                </div>

                {/* Tagline */}
                <div
                    style={{
                        fontSize: 32,
                        fontWeight: 400,
                        color: "#94a3b8",
                        textAlign: "center",
                        lineHeight: 1.4,
                        maxWidth: 900,
                    }}
                >
                    The Figaro Ecosystem
                </div>
            </div>
        ),
        { ...size },
    );
}
