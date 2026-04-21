// Shared navigation links for Header and MobileNav
export interface NavLink {
    href: string;
    label: string;
    description?: string;
    isSectionHeader?: boolean;
}

export const NAV_LINKS: NavLink[] = [
    { href: "/", label: "Home" },
    { href: "/fig", label: "FIG Token" },
    { href: "/workbench", label: "Workbench" },
    { href: "/builders", label: "Builders" },
    { href: "/operators", label: "Operators" },
];
