import type { Metadata } from "next";
import { OperatorLanding } from "@/components/operators/OperatorLanding";

export const metadata: Metadata = {
    title: "Operators — Figaro Protocol",
    description: "Register a wallet in OperatorRegistry, or manage your existing registration. Wallets without a registration see the wizard; registered wallets see the dashboard.",
};

export default function OperatorsPage() {
    return <OperatorLanding />;
}
