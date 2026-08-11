import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { OrdersList } from "./_components/OrdersList";

export const metadata: Metadata = withOg({
    title: "Your orders — Figaro Protocol",
    description: "Every order the connected wallet is on — buyer or seller — and anything awaiting its action.",
});

export default function OrdersListPage() {
    return <OrdersList />;
}
