import { ReactNode } from "react";

/**
 * Layout for the seven-screen operator onboarding flow.
 *
 * Each step renders its own content; the layout provides the shared
 * page shell (container + max width). The step indicator is rendered
 * inside each step's page so it can know its own `currentStepId`
 * without prop-drilling through the layout.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-2xl">
            {children}
        </section>
    );
}
