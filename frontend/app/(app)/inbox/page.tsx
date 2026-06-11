import type { Metadata } from "next";
import { Inbox } from "./_components/Inbox";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Inbox — Figaro",
    description: "Incoming orders awaiting acceptance and active orders in progress.",
};

export default function InboxPage() {
    return <Inbox />;
}
