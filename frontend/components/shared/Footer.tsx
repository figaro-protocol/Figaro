import Link from "next/link";
import { MARKETING_MAP } from "@/components/shared/navLinks";

const COL_LINK_CLS =
    "block text-sm text-ink-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded";

/**
 * The footer renders `MARKETING_MAP` one column per section — the same map the
 * mobile drawer flattens (`NAV_LINKS_MARKETING_DRAWER`). The section names are
 * structural here, not printed: each column already opens with its doorway link.
 */
export function Footer() {
    return (
        <footer className="border-t border-default bg-canvas">
            <div className="container mx-auto px-6 py-16">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
                    {MARKETING_MAP.map((group) => (
                        <div key={group.section} className="space-y-2">
                            {group.links.map((link) => (
                                <Link key={link.href} href={link.href} className={COL_LINK_CLS}>
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    ))}
                </div>
                <div className="mt-12 pt-8 border-t border-default flex flex-col gap-4 text-xs text-ink-muted sm:flex-row sm:items-start sm:justify-between">
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
                    </div>
                    <div className="space-y-1 sm:text-right">
                        <p>Figaro is a registered trademark. &copy; {new Date().getFullYear()} Figaro Protocol. All rights reserved.</p>
                        <p>Provided as-is, without warranty of any kind. No liability is accepted for loss, damages, or bugs. Use at your own risk.</p>
                    </div>
                </div>
            </div>
        </footer>
    );
}
