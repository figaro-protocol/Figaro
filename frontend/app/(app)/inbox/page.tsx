import type { Metadata } from "next";
import { MerchantInbox } from "@/components/core/inbox/MerchantInbox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Inbox — Figaro",
    description: "Incoming orders awaiting acceptance and active orders in fulfilment.",
};

export default function InboxPage() {
    return <MerchantInbox />;
}
