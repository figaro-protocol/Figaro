import { ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/shared/utils";

// Every color, border and ring value resolves to a token in
// docs/DESIGN_TOKENS.md §1; the shape is the §4 `tile` radius shared by
// every other button on the site (globals.css's base `button` rule).
// `default` is the filled-sumi shape (§1 accent discipline) rather than
// `bg-accent`: accent is capped at ONE surface per page and this variant
// is the site-wide default, so accent here would stack CTAs on any page
// with two buttons.
const buttonVariants = cva(
    "inline-flex items-center justify-center rounded-tile text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-ink-primary text-paper border border-ink-primary hover:bg-ink-body",
                destructive: "bg-error text-paper border border-error hover:bg-error/90",
                outline: "border border-default-strong bg-paper hover:bg-subtle text-ink-primary",
                secondary: "bg-subtle text-ink-primary border border-default hover:bg-subtle-hover",
                ghost: "bg-transparent text-ink-primary border border-transparent hover:bg-subtle",
                link: "bg-transparent border border-transparent text-ink-primary underline-offset-4 hover:underline",
            },
            size: {
                // min-h-11 (44px) satisfies WCAG 2.5.5 Target Size.
                default: "min-h-11 px-4 py-2",
                sm: "min-h-11 px-3 text-xs",
                lg: "min-h-12 px-8",
                icon: "min-h-11 min-w-11 h-11 w-11",
                // 28px — clears WCAG 2.5.8 Target Size (Minimum, AA: 24 CSS
                // px) but NOT 2.5.5 (AAA: 44). Admissible only in a dense
                // tool row acting on the content beside it; never a primary
                // CTA, never a lone control. `px-3` plus a real label keeps
                // the width past 24px too — a compact ICON-only button would
                // not, so use size="icon" for those. See DESIGN_TOKENS.md §7.
                compact: "min-h-7 px-3 text-xs",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> { }

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                style={{ touchAction: "manipulation" }} // Prevents double-tap zoom
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button,  };
