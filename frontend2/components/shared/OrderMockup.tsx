export function OrderMockup() {
    return (
        <div className="max-w-sm mx-auto border border-gray-300 rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    <div className="text-xs font-semibold text-black">Figaro Eats</div>
                </div>
                <div className="text-[10px] text-gray-500 font-mono">0x3f2a...a2c1</div>
            </div>

            <div className="px-5 py-4 space-y-4">
                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Order</div>
                    <div className="text-sm text-black font-semibold">Vindaloo &times; 1</div>
                    <div className="text-xs text-gray-500">from Cook <span className="font-mono">0x7d4b...b92f</span></div>
                    <div className="text-sm text-black mt-1">12.50 USDC</div>
                </div>

                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Delivery</div>
                    <div className="text-sm text-black">San Francisco</div>
                    <div className="text-xs text-gray-500">Driver <span className="font-mono">0xa41c...c1e8</span></div>
                    <div className="text-sm text-black mt-1">3.75 USDC</div>
                </div>

                <div className="border-t border-gray-200 pt-3 space-y-1">
                    <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Your deposit (returned on delivery)</span>
                        <span className="font-mono text-black">32.50</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Locked in kernel</span>
                        <span className="font-mono text-black">48.75</span>
                    </div>
                </div>

                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Status</div>
                    <ul className="space-y-1 text-xs">
                        <li className="flex items-center gap-2 text-gray-500"><span className="h-3 w-3 rounded-full border border-green-500 bg-green-500 text-white flex items-center justify-center text-[8px]">&#10003;</span>Prep started</li>
                        <li className="flex items-center gap-2 text-gray-500"><span className="h-3 w-3 rounded-full border border-green-500 bg-green-500 text-white flex items-center justify-center text-[8px]">&#10003;</span>Ready for pickup</li>
                        <li className="flex items-center gap-2 text-gray-500"><span className="h-3 w-3 rounded-full border border-green-500 bg-green-500 text-white flex items-center justify-center text-[8px]">&#10003;</span>Picked up</li>
                        <li className="flex items-center gap-2 text-gray-500"><span className="h-3 w-3 rounded-full border border-green-500 bg-green-500 text-white flex items-center justify-center text-[8px]">&#10003;</span>En route</li>
                        <li className="flex items-center gap-2 text-black font-semibold"><span className="h-3 w-3 rounded-full border border-gray-400 bg-white"></span>Delivered</li>
                    </ul>
                </div>

                <button className="w-full bg-black text-white text-sm font-semibold py-3 rounded-lg" disabled>
                    Confirm delivery
                </button>

                <div className="text-[10px] text-gray-400 text-center">
                    Mockup &mdash; a live order lives at <span className="font-mono">/i/figaro-eats</span>
                </div>
            </div>
        </div>
    );
}
