"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "figaro-onboarding-dismissed";

export function OnboardingBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            if (!window.localStorage.getItem(STORAGE_KEY)) {
                setVisible(true);
            }
        } catch {
            // localStorage unavailable
        }
    }, []);

    if (!visible) return null;

    const dismiss = () => {
        setVisible(false);
        try {
            window.localStorage.setItem(STORAGE_KEY, "1");
        } catch {
            // localStorage unavailable
        }
    };

    return (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-semibold mb-1">Welcome to the Protocol Terminal</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-800">
                        <li><strong>Connect your wallet</strong> — use the button in the header</li>
                        <li><strong>Set a currency</strong> — paste an ERC-20 address or click &quot;Use Default MockToken&quot;</li>
                        <li><strong>Enter a counterparty &amp; payment</strong> — both parties lock 2× payment as bonds</li>
                        <li><strong>Place Order</strong> — your wallet will prompt you to approve tokens, then sign the commitment</li>
                        <li><strong>Settle</strong> — the buyer resolves the process when the work is done</li>
                    </ol>
                    <p className="mt-2 text-blue-700">
                        For the game-theory derivation behind self-enforcing agreements, see{" "}
                        <a href="/cryptoeconomics" className="underline hover:no-underline">cryptoeconomics</a>.
                    </p>
                </div>
                <button
                    onClick={dismiss}
                    className="p-2 text-blue-400 hover:text-blue-700 text-lg leading-none flex-shrink-0"
                    aria-label="Dismiss onboarding guide"
                >
                    ×
                </button>
            </div>
        </div>
    );
}
