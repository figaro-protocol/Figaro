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

export function useRuntimeServices(): RuntimeServices {
    return useContext(RuntimeServicesContext);
}