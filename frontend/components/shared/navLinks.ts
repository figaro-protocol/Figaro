// Shared navigation links for Header and MobileNav.
// Axis: disciplinary conversation (Groups) and funding substrate (Grants)
// alongside the on-chain artifact surface (Specifications) and composition
// role (Builders). Papers are reading paths into groups; they are not a
// standalone shelf. The logo links home; no "Home" item here.
export interface NavLink {
    href: string;
    label: string;
    description?: string;
    isSectionHeader?: boolean;
}

export const NAV_LINKS: NavLink[] = [
    { href: "/spec", label: "Specifications" },
    { href: "/builders", label: "Builders" },
    { href: "/groups", label: "Groups" },
    { href: "/fig", label: "FIG" },
    { href: "/about", label: "About" },
];
