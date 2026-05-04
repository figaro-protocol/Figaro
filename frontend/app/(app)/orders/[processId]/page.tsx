import type { Metadata } from "next";
import { OrderTimelineView } from "@/components/core/orders/OrderTimelineView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Order — Figaro",
    description: "Live order status: events, current step, confirm receipt.",
};

interface Props {
    params: { processId: string };
}

export default function OrderPage({ params }: Props) {
    return <OrderTimelineView processId={params.processId} />;
}
