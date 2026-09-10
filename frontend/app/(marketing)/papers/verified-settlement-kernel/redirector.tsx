"use client";

import { useEffect } from "react";

/** Sends the reader to the paper's canonical address after first paint. */
export function Redirector() {
    useEffect(() => {
        window.location.replace("/papers/verified-resolution-kernel");
    }, []);
    return null;
}
