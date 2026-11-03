"use client";

import { QueryParamPage, processIdParam } from "@/components/shared/QueryParamPage";
import { OrderTimelineView } from "../_components/OrderTimelineView";

/**
 * /orders/view?process=<processId> — per-order live status.
 *
 * The processId is an open-world id (any bonded process), so it rides in a
 * query param (`QueryParamPage`); a missing or malformed id renders nothing.
 */
export default function OrderPage() {
    return (
        <QueryParamPage param="process" validate={processIdParam}>
            {(processId) => <OrderTimelineView processId={processId} />}
        </QueryParamPage>
    );
}
