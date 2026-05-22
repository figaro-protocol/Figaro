import Link from "next/link";

const COL_HEADER_CLS =
    "text-sm font-semibold text-ink-heading mb-4";
const COL_LINK_CLS =
    "block text-ink-heading hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded";

export function Footer() {
    return (
        <footer className="border-t border-default bg-canvas">
            <div className="container mx-auto px-6 py-16">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
                    <div>
                        <h4 className={COL_HEADER_CLS}>Protocol</h4>
                        <div className="space-y-2">
                            <Link href="/protocol" className={COL_LINK_CLS}>Protocol mechanisms</Link>
                            <Link href="/research" className={COL_LINK_CLS}>Research</Link>
                            <Link href="/spec" className={COL_LINK_CLS}>Specifications</Link>
                            <Link href="/schemas" className={COL_LINK_CLS}>Schemas</Link>
                            <Link href="/assemblies" className={COL_LINK_CLS}>Assemblies</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className={COL_HEADER_CLS}>Builders</h4>
                        <div className="space-y-2">
                            <Link href="/builders" className={COL_LINK_CLS}>Builders</Link>
                            <Link href="/builders/designer" className={COL_LINK_CLS}>Designer</Link>
                            <Link href="/builders/composability" className={COL_LINK_CLS}>Composability</Link>
                            <Link href="/integrate" className={COL_LINK_CLS}>Integrate</Link>
                            <Link href="/rpgf" className={COL_LINK_CLS}>RPGF</Link>
                            <Link href="/local-commerce" className={COL_LINK_CLS}>Local Commerce reference</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className={COL_HEADER_CLS}>Ecosystem</h4>
                        <div className="space-y-2">
                            <Link href="/discover" className={COL_LINK_CLS}>Discover operators</Link>
                            <Link href="/operators" className={COL_LINK_CLS}>Operators</Link>
                            <Link href="/fig" className={COL_LINK_CLS}>FIG Token</Link>
                        </div>
                    </div>
                </div>
                <div className="mt-12 pt-8 border-t border-default flex flex-col gap-4 text-xs text-ink-muted sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                        <a
                            href="https://github.com/figaro-protocol/Figaro-Prototype2"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                        >
                            GitHub
                        </a>
                        <a
                            href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/LICENSE"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                        >
                            MIT license
                        </a>
                        <a
                            href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/AUDIT_REPORT.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded"
                        >
                            Audit report
                        </a>
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
