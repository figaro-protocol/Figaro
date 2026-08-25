"use client";

import { getMissingContractEnv } from "@/lib/kernel/contracts";

export function ConfigurationBanner() {
    const missing = getMissingContractEnv();

    if (missing.length === 0) {
        return null;
    }

    return (
        <div className="border-b border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-fg">
            <div className="container mx-auto flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold">Runtime configuration is incomplete.</p>
                <p className="text-xs sm:text-sm">
                    Missing env vars: {missing.join(", ")}. Terminal and assembly actions may be unavailable until the local deployment is configured.
                </p>
            </div>
        </div>
    );
}