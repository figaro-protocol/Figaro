import type { Metadata } from "next";
import Link from "next/link";
import { Redirector } from "./redirector";

// Redirect stub: the canonical address is /papers/verified-resolution-kernel;
// this alias keeps saved links working and declares the canonical to robots.
export const metadata: Metadata = {
    title: "A Verified Resolution Kernel — Figaro Protocol",
    alternates: { canonical: "/papers/verified-resolution-kernel" },
};

export default function MovedPaper() {
    return (
        <main className="container mx-auto px-6 py-20 max-w-2xl">
            <Redirector />
            <p className="text-base leading-relaxed">
                The paper lives at its canonical address:{" "}
                <Link href="/papers/verified-resolution-kernel" className="font-medium underline">
                    A Verified Resolution Kernel
                </Link>
                .
            </p>
        </main>
    );
}
