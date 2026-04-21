/**
 * AUDIT FIX HP-4: Mobile Navigation Component
 * Provides hamburger menu for mobile devices
 */

"use client";

import { useState, useEffect } from "react";
import Menu from "@/components/icons/Menu";
import X from "@/components/icons/X";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, NavLink } from "@/components/shared/navLinks";

interface MobileNavProps {
    links?: NavLink[];
    logo?: React.ReactNode;
    theme?: "light" | "dark";
}

export function MobileNav({ links, logo, theme = "dark" }: MobileNavProps) {
    links = links ?? NAV_LINKS;
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    // Close menu when route changes (avoids unmounting Link before navigation completes)
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    const isActive = (href: string) => pathname === href;

    const btnCls =
        theme === "dark"
            ? "md:hidden p-2 text-white hover:bg-slate-800 rounded-lg transition-colors"
            : "md:hidden p-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors";

    const backdropCls = theme === "dark" ? "bg-black/60" : "bg-black/35";
    const panelCls =
        theme === "dark"
            ? "bg-slate-900 shadow-2xl"
            : "border-r border-neutral-200 bg-white shadow-xl";
    const headerBorderCls = theme === "dark" ? "border-slate-700" : "border-neutral-200";
    const logoCls = theme === "dark" ? "text-white" : "text-black";
    const closeCls =
        theme === "dark"
            ? "text-slate-400 hover:text-white"
            : "text-neutral-500 hover:text-black hover:bg-neutral-100";
    const footerTextCls = theme === "dark" ? "text-slate-500" : "text-neutral-500";

    return (
        <>
            {/* Hamburger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={btnCls}
                aria-label="Toggle mobile menu"
                aria-expanded={isOpen}
                aria-controls="mobile-menu"
            >
                {isOpen ? (
                    <X className="w-6 h-6" aria-hidden="true" />
                ) : (
                    <Menu className="w-6 h-6" aria-hidden="true" />
                )}
            </button>

            {/* Mobile Menu Overlay */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        data-testid="mobile-nav-backdrop"
                        className={`fixed inset-0 z-40 md:hidden ${backdropCls}`}
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Slide-out Menu */}
                    <div
                        id="mobile-menu"
                        className={`fixed top-0 left-0 z-50 flex h-full w-80 transform flex-col transition-transform duration-300 ease-in-out md:hidden ${panelCls}`}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Mobile navigation"
                    >
                        {/* Menu Header */}
                        <div className={`flex items-center justify-between border-b p-6 ${headerBorderCls}`}>
                            {logo || (
                                <span className={`text-xl font-bold ${logoCls}`}>Figaro Protocol</span>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className={`rounded-lg p-2 ${closeCls}`}
                                aria-label="Close menu"
                            >
                                <X className="w-5 h-5" aria-hidden="true" />
                            </button>
                        </div>

                        {/* Navigation Links */}
                        <nav className="flex-1 overflow-y-auto p-4">
                            <ul className="space-y-1" role="list">
                                {links.map((link, i) => (
                                    <li key={link.isSectionHeader ? `section-${link.label}` : link.href}>
                                        {link.isSectionHeader ? (
                                            <div className={`px-4 pt-${i === 0 ? "1" : "4"} pb-1 text-[11px] font-semibold uppercase tracking-widest ${theme === "dark" ? "text-slate-500" : "text-neutral-500"}`}>
                                                {link.label}
                                            </div>
                                        ) : (
                                            <Link
                                                href={link.href}
                                                className={`
                        block px-4 py-3 rounded-lg transition-colors
                        ${isActive(link.href)
                                                        ? theme === "dark"
                                                            ? "bg-blue-600 text-white font-semibold"
                                                            : "bg-black text-white font-semibold"
                                                        : theme === "dark"
                                                            ? "text-slate-300 hover:bg-slate-800 hover:text-white"
                                                            : "text-neutral-700 hover:bg-neutral-100 hover:text-black"
                                                    }
                      `}
                                                aria-current={isActive(link.href) ? "page" : undefined}
                                            >
                                                <div className="font-medium">{link.label}</div>
                                                {link.description && (
                                                    <div className="text-xs mt-0.5 opacity-80">
                                                        {link.description}
                                                    </div>
                                                )}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        {/* Menu Footer (optional branding) */}
                        <div className={`border-t p-4 text-center ${headerBorderCls}`}>
                            <p className={`text-xs ${footerTextCls}`}>
                                Self-Enforcing Agreements
                            </p>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
