import { ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/shared/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-black text-white border border-black hover:bg-gray-800",
                destructive: "bg-red-600 text-white border border-red-600 hover:bg-red-700",
                outline: "border border-gray-300 bg-white hover:bg-gray-50 text-black",
                secondary: "bg-gray-100 text-black border border-gray-200 hover:bg-gray-200",
                ghost: "bg-transparent text-black border border-transparent hover:bg-gray-100",
                link: "text-black underline-offset-4 hover:underline",
            },
            size: {
                // AUDIT FIX HP-4: Touch-optimized sizes (44x44px minimum)
                default: "min-h-[44px] px-4 py-2",
                sm: "min-h-[44px] px-3 text-xs",
                lg: "min-h-[48px] px-8",
                icon: "min-h-[44px] min-w-[44px] h-11 w-11",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

export interface ButtonProps
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

export { Button, buttonVariants };
