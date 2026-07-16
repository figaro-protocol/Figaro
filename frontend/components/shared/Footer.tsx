import Link from "next/link";

const COL_LINK_CLS =
    "block text-sm text-ink-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded";

export function Footer() {
    return (
        <footer className="border-t border-default bg-canvas">
            <div className="container mx-auto px-6 py-16">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                        <Link href="/protocol" className={COL_LINK_CLS}>Protocol mechanisms</Link>
                        <Link href="/why" className={COL_LINK_CLS}>Why</Link>
                        <Link href="/physics" className={COL_LINK_CLS}>Physics</Link>
                        <Link href="/cryptoeconomics" className={COL_LINK_CLS}>Cryptoeconomics</Link>
                        <Link href="/papers" className={COL_LINK_CLS}>Papers</Link>
                        <Link href="/security" className={COL_LINK_CLS}>Security</Link>
                        <Link href="/spec" className={COL_LINK_CLS}>Specifications</Link>
                    </div>
                    <div className="space-y-2">
                        <Link href="/builders" className={COL_LINK_CLS}>Builders</Link>
                        <Link href="/builders/designer" className={COL_LINK_CLS}>Designer</Link>
                        <Link href="/builders/clauses" className={COL_LINK_CLS}>Register a clause</Link>
                        <Link href="/builders/composability" className={COL_LINK_CLS}>Composability</Link>
                        <Link href="/clauses" className={COL_LINK_CLS}>Clauses</Link>
                        <Link href="/assemblies" className={COL_LINK_CLS}>Assemblies</Link>
                        <Link href="/local-commerce" className={COL_LINK_CLS}>Local Commerce reference</Link>
                        <Link href="/integrate" className={COL_LINK_CLS}>Integrate</Link>
                        <Link href="/clause-rewards" className={COL_LINK_CLS}>Clause rewards</Link>
                        <Link href="/papers/florin-schelling-point-token" className={COL_LINK_CLS}>florin token</Link>
                    </div>
                    <div className="space-y-2">
                        <Link href="/users" className={COL_LINK_CLS}>Users</Link>
                        <Link href="/discover" className={COL_LINK_CLS}>Discover sellers</Link>
                        <Link href="/sellers" className={COL_LINK_CLS}>Sellers</Link>
                        <Link href="/agents" className={COL_LINK_CLS}>Agents</Link>
                    </div>
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
