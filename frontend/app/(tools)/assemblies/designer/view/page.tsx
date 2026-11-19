"use client";

import { QueryParamPage, slugParam } from "@/components/shared/QueryParamPage";
import { ViewAssemblyClient } from "./ViewAssemblyClient";

/**
 * /assemblies/designer/view?slug=<slug> — read-only inspect of an assembly.
 *
 * The slug resolves at the client to either a localStorage draft or an
 * on-chain published assembly (via ProcessRegistered events + IPFS). It is
 * an open-world id, so it rides in a query param (`QueryParamPage`); a
 * missing slug names no assembly, and the page says so in one line.
 */
export default function Page() {
    return (
        <QueryParamPage param="slug" validate={slugParam} shows="one assembly, read only">
            {(slug) => <ViewAssemblyClient slug={slug} />}
        </QueryParamPage>
    );
}
