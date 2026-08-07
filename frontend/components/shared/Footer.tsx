import Link from "next/link";

/**
 * The footer is the LEGAL/IDENTITY strip only (operator rule 2026-08-06):
 * the site-map columns died with the per-page "More on…" closers — the nav
 * tree (`NavTreeRow`, fed by `MARKETING_MAP`) is the ONE wayfinding surface
 * on desktop, the drawer on mobile. Do not regrow link columns here.
 */
export function Footer() {
    return (
        <footer className="border-t border-default bg-canvas">
            <div className="container mx-auto px-6 py-8 flex flex-col gap-4 text-xs text-ink-muted sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <a
                        href="https://github.com/figaro-protocol/Figaro"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                    >
                        GitHub
                    </a>
                    <a
                        href="https://github.com/figaro-protocol/Figaro/blob/main/LICENSE"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                    >
                        MIT license
                    </a>
                    <Link
                        href="/security"
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                    >
                        Security
                    </Link>
                    <Link
                        href="/faq"
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                    >
                        FAQ
                    </Link>
                    <Link
                        href="/glossary"
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                    >
                        Glossary
                    </Link>
                </div>
                <div className="space-y-1 sm:text-right">
                    <p>Figaro is a registered trademark. &copy; {new Date().getFullYear()} Figaro Protocol. All rights reserved.</p>
                    <p>Provided as-is, without warranty of any kind. No liability is accepted for loss, damages, or bugs. Use at your own risk.</p>
                </div>
            </div>
        </footer>
    );
}
