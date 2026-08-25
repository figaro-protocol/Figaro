import { cn } from "@/lib/shared/utils";
import { colorTokens } from "@/lib/shared/designTokenValues";

/**
 * A square initials badge — the fallback shown when a member has no logo
 * (or it fails to load): the first two characters of a display name,
 * uppercased, centered in a solid square. Three current looks share this
 * shape and differ only by tone/size/radius:
 *  - the discover-card listing (`tone="accent"`, fixed 40px, 4px radius,
 *    Tailwind `text-xs`)
 *  - the seller-detail hero logo fallback (`tone="accent"`, caller-picked
 *    size, 6px radius, font size scaled with `size`)
 *  - the catalogue-item image fallback (`tone="neutral"`, fixed 48px, 4px
 *    radius, bordered, `aria-hidden`)
 */
export interface InitialsAvatarProps {
    /** Display name; the initials are its first two characters, uppercased. */
    name: string;
    /** "accent" = solid `ink.body` background, `paper` text. "neutral" =
     *  `subtle` background, `default` border, `ink-body` text. */
    tone?: "accent" | "neutral";
    /** Square side, in pixels. */
    size?: number;
    /** Corner radius, in pixels. */
    radius?: number;
    /** Explicit pixel font size, scaling with `size`. Omit to use Tailwind's
     *  `text-xs` (12px) — the fixed-size adopters' look. */
    fontSize?: number;
    /** Merged onto the outer element. */
    className?: string;
    "aria-hidden"?: boolean;
}

export function InitialsAvatar({
    name,
    tone = "accent",
    size = 40,
    radius = 4,
    fontSize,
    className,
    "aria-hidden": ariaHidden,
}: InitialsAvatarProps) {
    const initials = name.slice(0, 2).toUpperCase();
    return (
        <div
            className={cn(
                "flex items-center justify-center font-semibold",
                fontSize === undefined && "text-xs",
                tone === "accent"
                    ? "text-paper"
                    : "bg-subtle border border-default text-ink-body",
                className,
            )}
            style={{
                width: size,
                height: size,
                borderRadius: radius,
                ...(fontSize !== undefined ? { fontSize } : {}),
                // `ink.body`, not `ink.muted`: the initials sit in `text-paper`
                // on this fill, and muted drops the pair below AA (ruled
                // 2026-08-25). Taken from the palette module rather than spelled
                // as a hex — the sibling values here are numeric, so the fill
                // stays in the same `style` object.
                ...(tone === "accent" ? { backgroundColor: colorTokens.ink.body } : {}),
            }}
            aria-hidden={ariaHidden}
        >
            {initials}
        </div>
    );
}
