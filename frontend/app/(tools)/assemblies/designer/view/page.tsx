"use client";

import { QueryParamPage, slugParam } from "@/components/shared/QueryParamPage";
import { ViewAssemblyClient } from "./ViewAssemblyClient";

/**
 * /assemblies/designer/view?slug=<slug> — read-only inspect of an assembly.
 *
 * The slug resolves at the client to either a localStorage draft or an
 * on-chain published assembly (via AssemblyRegistered events + IPFS). It is
 * an open-world id, so it rides in a query param (`QueryParamPage`); a
 * missing slug renders nothing.
 */
export default function Page() {
    return (
        <QueryParamPage param="slug" validate={slugParam}>
            {(slug) => <ViewAssemblyClient slug={slug} />}
        </QueryParamPage>
    );
}
