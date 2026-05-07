import type { Metadata } from "next";
import { OperatorLanding } from "@/components/operators/OperatorLanding";

export const metadata: Metadata = {
    title: "Your operator profile — Figaro Protocol",
    description: "Registered-operator dashboard: profile summary, manage identity / catalogue / assemblies / agents, withdraw deposit. Wallets that aren't registered are routed to onboarding.",
};

export default function OperatorsPage() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-24 max-w-2xl space-y-10">
            <div>
                <h1 className="text-heading-h1 text-ink-heading mb-4">
                    Your profile.
                </h1>
                <p className="text-body-lead text-ink-body">
                    This wallet is registered in <code>OperatorRegistry</code>. Manage the off-chain envelope — identity, catalogue, assemblies, agent endpoints — or update the on-chain pointer with <code>updateProfile</code>. De-registering returns the deposit after a one-year lock.
                </p>
            </div>

            <OperatorLanding />
        </section>
    );
}
