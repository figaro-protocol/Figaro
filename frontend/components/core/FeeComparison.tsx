"use client";

export function FeeComparison() {
    return (
        <div className="bg-white border border-gray-300 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-black mb-3">The deposit replaces the coordination fee</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                <div>
                    <p className="text-2xl font-bold text-black">15&ndash;30%</p>
                    <p className="text-xs text-gray-500">Platform coordination fee</p>
                    <p className="text-xs text-gray-500 mt-1">Pays for trust, matching, and dispute handling on your behalf</p>
                </div>
                <div className="hidden sm:block">
                    <p className="text-2xl font-bold text-black">&rarr;</p>
                </div>
                <div>
                    <p className="text-2xl font-bold text-black">0%</p>
                    <p className="text-xs text-gray-500">Figaro protocol fee</p>
                    <p className="text-xs text-gray-500 mt-1">The deposit prices trust directly. Settlement has no fee. Gas fees apply.</p>
                </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">
                Sellers keep 100% of payment (gas fees apply). Buyers pay the real price. The deposit &mdash; which you get back &mdash; replaces the entire coordination stack.
            </p>
        </div>
    );
}
