import type { Metadata } from "next";
import { OrdersList } from "./_components/OrdersList";

export const metadata: Metadata = {
    title: "Your orders — Figaro",
    description: "Every order the connected wallet is on — buyer or seller — and anything awaiting its action.",
};

export default function OrdersListPage() {
    return <OrdersList />;
}
