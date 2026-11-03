"use client";

import { QueryParamPage, slugParam } from "@/components/shared/QueryParamPage";
import { EditAssemblyClient } from "./EditAssemblyClient";

/**
 * /assemblies/designer/edit?slug=<slug> — topology canvas for editing a saved
 * draft.
 *
 * The slug must resolve to a localStorage draft; the client renders a
 * "draft not found" empty state if no match. Forking a published
 * on-chain assembly is the separate Fork action on `PublishedList`,
 * which spawns a new local draft under a fresh slug before routing here.
 *
 * The slug is an open-world id, so it rides in a query param
 * (`QueryParamPage`); a missing slug renders nothing.
 */
export default function Page() {
    return (
        <QueryParamPage param="slug" validate={slugParam}>
            {(slug) => <EditAssemblyClient slug={slug} />}
        </QueryParamPage>
    );
}
