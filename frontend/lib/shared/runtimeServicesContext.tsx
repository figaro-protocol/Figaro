"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
    DEFAULT_RUNTIME_SERVICES,
    type RuntimeServices,
} from "@/lib/shared/runtimeServices";

const RuntimeServicesContext = createContext<RuntimeServices>(DEFAULT_RUNTIME_SERVICES);

interface RuntimeServicesProviderProps {
    services?: RuntimeServices;
    children: ReactNode;
}

/** Inject services into the hooks below it (test-only: production reads the
 *  context default). @internal */
// lint-allow-duplicate-symbol: the provider that supplies a RuntimeServices value to the tree
export function RuntimeServicesProvider({
    services = DEFAULT_RUNTIME_SERVICES,
    children,
}: RuntimeServicesProviderProps) {
    return (
        <RuntimeServicesContext.Provider value={services}>
            {children}
        </RuntimeServicesContext.Provider>
    );
}

// lint-allow-duplicate-symbol: the hook that reads the RuntimeServices value its provider supplies
export function useRuntimeServices(): RuntimeServices {
    return useContext(RuntimeServicesContext);
}