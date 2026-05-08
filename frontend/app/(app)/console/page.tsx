"use client";

import { Console } from "@/components/console/Console";
import { FigaroProvider } from "@/lib/console/provider";

export default function ConsolePage() {
    return (
        <div className="flex flex-col min-h-[80vh]">
            <header className="px-6 py-4 border-b border-zinc-800 shrink-0">
                <p className="text-xs font-semibold text-zinc-500 mb-1">
                    supervision
                </p>
                <h1 className="text-2xl font-bold text-black">Figaro Console</h1>
            </header>
            <FigaroProvider>
                <Console />
            </FigaroProvider>
        </div>
    );
}
