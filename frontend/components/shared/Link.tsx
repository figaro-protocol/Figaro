"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { resolveHref } from "@/lib/shared/sites";

// The one Link the tree uses. Every page writes its links as in-tree paths;
// this wrapper resolves each against the site map (lib/shared/sites.ts) so a
// link to a route another host owns is emitted absolute when the sites are
// split, and untouched when they are not. Nothing else about next/link changes.
// scripts/lint-site-map.sh fails a next/link import anywhere else.
type Props = ComponentProps<typeof NextLink>;

export default function Link({ href, ...rest }: Props) {
    const pathname = usePathname() ?? "/";
    const resolved = typeof href === "string" ? resolveHref(href, pathname) : href;
    return <NextLink href={resolved} {...rest} />;
}
