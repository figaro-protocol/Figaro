import Link from "next/link";

export function Footer() {
    return (
        <footer className="border-t border-gray-300 bg-transparent">
            <div className="container mx-auto px-6 py-16">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
                    <div>
                        <h4 className="text-black font-bold mb-4">PROTOCOL</h4>
                        <div className="space-y-2">
                            <Link href="/figaro-eats" className="block text-black hover:underline">Figaro Eats</Link>
                            <Link href="/fig" className="block text-black hover:underline">FIG Token</Link>
                            <Link href="/workbench" className="block text-black hover:underline">Workbench</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-black font-bold mb-4">BUILD</h4>
                        <div className="space-y-2">
                            <Link href="/builders" className="block text-black hover:underline">Builders</Link>
                            <Link href="/builders/assemblies" className="block text-black hover:underline">Reference Assemblies</Link>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-black font-bold mb-4">RESOURCES</h4>
                        <div className="space-y-2">
                            <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/archive/paper/figaro3.pdf" target="_blank" rel="noopener noreferrer" className="block text-black hover:underline">White Paper</a>
                            <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/formal/" target="_blank" rel="noopener noreferrer" className="block text-black hover:underline">Formal Verification</a>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-black font-bold mb-4">COMMUNITY</h4>
                        <div className="space-y-2">
                            <a href="https://twitter.com/figaroprotocol" target="_blank" rel="noopener noreferrer" className="block text-black hover:underline">X (Twitter)</a>
                            <a href="https://github.com/figaro-protocol" target="_blank" rel="noopener noreferrer" className="block text-black hover:underline">GitHub</a>
                        </div>
                    </div>
                </div>
                <div className="mt-8 pt-8 border-t border-gray-300 text-center text-black text-sm">
                    <p>Figaro Protocol &mdash; Trade infrastructure. No intermediaries.</p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center items-center mt-2 text-xs text-gray-600">
                        <span>Open source &amp; formally verified</span>
                        <span className="hidden sm:inline">|</span>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="hover:underline">View on GitHub</a>
                        <span className="hidden sm:inline">|</span>
                        <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/audit/" target="_blank" rel="noopener noreferrer" className="hover:underline">Read the audit</a>
                        <span className="hidden sm:inline">|</span>
                        <a href="/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:underline">License: MIT</a>
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

