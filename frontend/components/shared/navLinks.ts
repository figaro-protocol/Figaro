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
    { href: "/protocol", label: "Protocol" },
    { href: "/cryptoeconomics", label: "Cryptoeconomics" },
    { href: "/composability", label: "Composability" },
    { href: "/about", label: "About" },
];
