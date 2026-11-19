"use client";

import { QueryParamPage, processIdParam } from "@/components/shared/QueryParamPage";
import { OrderTimelineView } from "../_components/OrderTimelineView";

/**
 * /orders/view?process=<processId> — per-order live status.
 *
 * The processId is an open-world id (any bonded process), so it rides in a
 * query param (`QueryParamPage`); a missing or malformed id names no
 * process, and the page says so in one line.
 */
export default function OrderPage() {
    return (
        <QueryParamPage param="process" validate={processIdParam} shows="the live status of one process">
            {(processId) => <OrderTimelineView processId={processId} />}
        </QueryParamPage>
    );
}
