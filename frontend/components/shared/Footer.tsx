import Link from "next/link";

const COL_HEADER_CLS =
    "text-sm font-semibold text-ink-heading mb-4";
const COL_LINK_CLS =
    "block text-ink-heading hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded";

export function Footer() {
    return (
        <footer className="border-t border-default bg-canvas">
            <div className="container mx-auto px-6 py-16">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
                    <div>
                        <h4 className={COL_HEADER_CLS}>Cryptoeconomics</h4>
                        <div className="space-y-2">
                            <Link href="/protocol" className={COL_LINK_CLS}>Protocol mechanisms</Link>
                            <Link href="/cryptoeconomics" className={COL_LINK_CLS}>Cryptoeconomics</Link>
                            <Link href="/composability" className={COL_LINK_CLS}>Composability</Link>
                            <Link href="/spec" className={COL_LINK_CLS}>Specifications</Link>
                            <Link href="/schemas" className={COL_LINK_CLS}>Schemas</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className={COL_HEADER_CLS}>Builders</h4>
                        <div className="space-y-2">
                            <Link href="/builders" className={COL_LINK_CLS}>Builders</Link>
                            <Link href="/builders/designer" className={COL_LINK_CLS}>Designer</Link>
                            <Link href="/builders/composability" className={COL_LINK_CLS}>Composability — architecture</Link>
                            <Link href="/local-commerce" className={COL_LINK_CLS}>Local Commerce reference</Link>
                            <Link href="/integrate" className={COL_LINK_CLS}>Integrate</Link>
                            <Link href="/operators" className={COL_LINK_CLS}>Operators</Link>
                            <Link href="/audit" className={COL_LINK_CLS}>Audit</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className={COL_HEADER_CLS}>Ecosystem</h4>
                        <div className="space-y-2">
                            <Link href="/groups" className={COL_LINK_CLS}>Working Groups</Link>
                            <Link href="/discover" className={COL_LINK_CLS}>Discover operators</Link>
                            <Link href="/fig" className={COL_LINK_CLS}>FIG Token</Link>
                            <Link href="/fig/design" className={COL_LINK_CLS}>FIG Design</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className={COL_HEADER_CLS}>About</h4>
                        <div className="space-y-2">
                            <a
                                href="https://github.com/figaro-protocol"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={COL_LINK_CLS}
                            >
                                GitHub
                            </a>
                        </div>
                    </div>
                </div>
                <div className="mt-8 pt-8 border-t border-default text-center text-ink-heading text-sm">
                    <p>Figaro Protocol &mdash; The TCP/IP of Trade.</p>
                    <div className="flex flex-wrap gap-2 justify-center items-center mt-3">
                        <a
                            href="https://github.com/figaro-protocol/Figaro-Prototype2"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                            aria-label="GitHub repository star count"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="https://img.shields.io/github/stars/figaro-protocol/Figaro-Prototype2?style=flat&label=stars&color=black&logo=github"
                                alt="GitHub stars"
                                className="h-5"
                            />
                        </a>
                        <a
                            href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/LICENSE"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                            aria-label="MIT license"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="https://img.shields.io/badge/license-MIT-black?style=flat"
                                alt="License: MIT"
                                className="h-5"
                            />
                        </a>
                        <a
                            href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/AUDIT_REPORT.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                            aria-label="Audit report"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="https://img.shields.io/badge/audit-report-black?style=flat"
                                alt="Audit report"
                                className="h-5"
                            />
                        </a>
                    </div>
                    <div className="mt-3 text-xs text-ink-muted">
                        <span>
                            Figaro is a registered trademark. &copy; {new Date().getFullYear()} Figaro Protocol. All rights reserved. Provided as-is, without warranty of any kind. No liability is accepted for loss, damages, or bugs. Use at your own risk.
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
