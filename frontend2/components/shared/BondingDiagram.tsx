export function BondingDiagram() {
    return (
        <div className="my-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
            <div className="space-y-8">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
                        Phase 1 &middot; Both sides deposit
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:gap-3">
                        <div className="text-center shrink-0 w-24 sm:w-28">
                            <div className="px-2 sm:px-4 py-3 border border-black rounded bg-white font-semibold text-xs sm:text-sm">Buyer</div>
                            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">wallet</div>
                        </div>
                        <div className="flex-1 text-center min-w-0">
                            <div className="text-[10px] sm:text-xs text-gray-600 font-mono whitespace-nowrap">2P &rarr;</div>
                            <div className="h-px bg-gray-300 w-full mt-1"></div>
                        </div>
                        <div className="text-center shrink-0 w-28 sm:w-36">
                            <div className="px-2 sm:px-4 py-3 border border-black rounded bg-black text-white font-semibold text-xs sm:text-sm">Figaro Kernel</div>
                            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">holds 4P</div>
                        </div>
                        <div className="flex-1 text-center min-w-0">
                            <div className="text-[10px] sm:text-xs text-gray-600 font-mono whitespace-nowrap">&larr; 2V</div>
                            <div className="h-px bg-gray-300 w-full mt-1"></div>
                        </div>
                        <div className="text-center shrink-0 w-24 sm:w-28">
                            <div className="px-2 sm:px-4 py-3 border border-black rounded bg-white font-semibold text-xs sm:text-sm">Seller</div>
                            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">wallet</div>
                        </div>
                    </div>
                </div>

                <div>
                    <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
                        Phase 2 &middot; Buyer calls <code className="text-[11px]">resolveProcess()</code>
                    </div>
                    <div className="flex items-center justify-between gap-2 sm:gap-3">
                        <div className="text-center shrink-0 w-24 sm:w-28">
                            <div className="px-2 sm:px-4 py-3 border border-black rounded bg-white font-semibold text-xs sm:text-sm">Buyer</div>
                            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">refunded P</div>
                        </div>
                        <div className="flex-1 text-center min-w-0">
                            <div className="text-[10px] sm:text-xs text-gray-600 font-mono whitespace-nowrap">&larr; P</div>
                            <div className="h-px bg-gray-300 w-full mt-1"></div>
                        </div>
                        <div className="text-center shrink-0 w-28 sm:w-36">
                            <div className="px-2 sm:px-4 py-3 border border-gray-300 rounded bg-gray-100 text-gray-500 text-xs sm:text-sm">Kernel</div>
                            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">disburses 4P</div>
                        </div>
                        <div className="flex-1 text-center min-w-0">
                            <div className="text-[10px] sm:text-xs text-gray-600 font-mono whitespace-nowrap">2V + P &rarr;</div>
                            <div className="h-px bg-gray-300 w-full mt-1"></div>
                        </div>
                        <div className="text-center shrink-0 w-24 sm:w-28">
                            <div className="px-2 sm:px-4 py-3 border border-black rounded bg-white font-semibold text-xs sm:text-sm">Seller</div>
                            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">receives 2V + P</div>
                        </div>
                    </div>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed pt-3 border-t border-gray-200">
                    <strong>P</strong> = payment. <strong>V</strong> = cumulative value the seller bonds against (equals P for a single-hop root order; larger for sub-orders in a process tree). Buyer deposits <strong>2P</strong> (payment + equal collateral); seller deposits <strong>2V</strong> (2&times; their obligation). At resolution, kernel balance clears: buyer receives <strong>P</strong>, seller receives <strong>2V + P</strong>. Net: buyer spends P, seller earns P. No platform, no admin, no arbitrator &mdash; just math on locked collateral.
                </p>
            </div>
        </div>
    );
}
