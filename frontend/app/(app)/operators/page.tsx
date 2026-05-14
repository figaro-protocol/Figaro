import type { Metadata } from "next";
import { OperatorLanding } from "@/components/operators/OperatorLanding";

export const metadata: Metadata = {
    title: "Operators — Figaro Protocol",
    description: "Register a wallet in OperatorRegistry, or manage your existing registration. Wallets without a registration see the wizard; registered wallets see the dashboard.",
};

export default function OperatorsPage() {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-2xl space-y-12">
            <OperatorLanding />
        </section>
    );
}
