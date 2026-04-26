import Link from "next/link";

export function Footer() {
    return (
        <footer className="border-t border-gray-300 bg-transparent">
            <div className="container mx-auto px-6 py-16">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
                    <div>
                        <h4 className="text-black font-bold mb-4">SPECIFICATIONS</h4>
                        <div className="space-y-2">
                            <Link href="/spec" className="block text-black hover:underline">Overview</Link>
                            <Link href="/schemas" className="block text-black hover:underline">Schemas</Link>
                            <Link href="/verification" className="block text-black hover:underline">Verification</Link>
                            <Link href="/publications" className="block text-black hover:underline">Papers</Link>
                            <Link href="/fig" className="block text-black hover:underline">FIG Token</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-black font-bold mb-4">BUILDERS</h4>
                        <div className="space-y-2">
                            <Link href="/builders" className="block text-black hover:underline">Builders</Link>
                            <Link href="/builders/designer" className="block text-black hover:underline">Designer</Link>
                            <Link href="/builders/assemblies" className="block text-black hover:underline">Assemblies</Link>
                            <Link href="/integrate" className="block text-black hover:underline">Integrate (SDK)</Link>
                            <Link href="/operators" className="block text-black hover:underline">Operators</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-black font-bold mb-4">GROUPS</h4>
                        <div className="space-y-2">
                            <Link href="/groups" className="block text-black hover:underline">Working Groups</Link>
                            <Link href="/groups/economics-game-theory" className="block text-black hover:underline">Economics &amp; Game Theory</Link>
                            <Link href="/groups/computer-science-cryptography" className="block text-black hover:underline">CS &amp; Cryptography</Link>
                            <Link href="/groups/philosophy-law-ethics" className="block text-black hover:underline">Philosophy, Law &amp; Ethics</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-black font-bold mb-4">ABOUT</h4>
                        <div className="space-y-2">
                            <Link href="/about" className="block text-black hover:underline">About Figaro</Link>
                            <Link href="/help" className="block text-black hover:underline">Help</Link>
                            <a href="https://github.com/figaro-protocol" target="_blank" rel="noopener noreferrer" className="block text-black hover:underline">GitHub</a>
                            <a href="https://twitter.com/figaroprotocol" target="_blank" rel="noopener noreferrer" className="block text-black hover:underline">X (Twitter)</a>
                        </div>
                    </div>
                </div>
                <div className="mt-8 pt-8 border-t border-gray-300 text-center text-black text-sm">
                    <p>Figaro Protocol &mdash; The TCP of trade.</p>
                    <div className="flex flex-wrap gap-2 justify-center items-center mt-3">
                        <a
                            href="https://github.com/figaro-protocol/Figaro-Prototype2"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block"
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
                            className="inline-block"
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
                            href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/audit/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block"
                            aria-label="Audit reports"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="https://img.shields.io/badge/audit-public-black?style=flat"
                                alt="Audit: public"
                                className="h-5"
                            />
                        </a>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center items-center mt-3 text-xs text-gray-600">
                        <span>Open source &amp; formally verified</span>
                        <span className="hidden sm:inline">|</span>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="hover:underline">View on GitHub</a>
                        <span className="hidden sm:inline">|</span>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/audit/" target="_blank" rel="noopener noreferrer" className="hover:underline">Read the audit</a>
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                        <span>Figaro is a registered trademark. &copy; {new Date().getFullYear()} Figaro Protocol. All rights reserved.</span>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                        <span>This protocol and software are provided as-is, without warranty of any kind. No liability is accepted for loss, damages, or bugs. Use at your own risk.</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
