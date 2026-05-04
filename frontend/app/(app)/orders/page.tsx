import type { Metadata } from "next";
import { BuyerOrdersList } from "@/components/core/orders/BuyerOrdersList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Your orders — Figaro",
    description: "Active and completed orders for the connected wallet.",
};

export default function OrdersListPage() {
    return <BuyerOrdersList />;
}
