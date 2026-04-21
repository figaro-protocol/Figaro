import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Figaro Protocol — Self-enforcing agreements between strangers";
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
                    Self-enforcing agreements between strangers
                </div>

                {/* Divider */}
                <div
                    style={{
                        width: 120,
                        height: 4,
                        background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                        borderRadius: 2,
                        marginTop: 40,
                        marginBottom: 40,
                    }}
                />

                {/* Three pillars */}
                <div
                    style={{
                        display: "flex",
                        gap: 60,
                        fontSize: 20,
                        color: "#64748b",
                        fontWeight: 500,
                    }}
                >
                    <span>Asymmetric Bonding</span>
                    <span style={{ color: "#475569" }}>·</span>
                    <span>Nash Equilibrium</span>
                    <span style={{ color: "#475569" }}>·</span>
                    <span>No Escape Hatches</span>
                </div>
            </div>
        ),
        { ...size },
    );
}
