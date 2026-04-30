"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Menu from "@/components/icons/Menu";
import X from "@/components/icons/X";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, NavLink } from "@/components/shared/navLinks";

interface MobileNavProps {
    links?: NavLink[];
    logo?: React.ReactNode;
    theme?: "light" | "dark";
    /** Optional CTA pinned to the top of the slide-out drawer. Marketing
     *  passes `<DiscoverButton>`; (app) omits it. */
    topCta?: ReactNode;
}

export function MobileNav({ links, logo, theme = "dark", topCta }: MobileNavProps) {
    links = links ?? NAV_LINKS;
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Close menu when route changes (avoids unmounting Link before navigation completes)
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Focus trap + Escape-to-close + focus restoration on the open panel.
    useEffect(() => {
        if (!isOpen) return;

        const panel = panelRef.current;
        if (!panel) return;

        // Focus the first focusable element on open.
        const focusables = panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        focusables[0]?.focus();

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setIsOpen(false);
                triggerRef.current?.focus();
                return;
            }
            if (e.key === "Tab") {
                const list = panel.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
                );
                if (list.length === 0) return;
                const first = list[0];
                const last = list[list.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen]);

    const close = () => {
        setIsOpen(false);
        triggerRef.current?.focus();
    };

    const isActive = (href: string) => pathname === href;

    const btnCls =
        theme === "dark"
            ? "md:hidden p-2 text-white hover:bg-slate-800 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white"
            : "md:hidden p-2 text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black";

    const backdropCls = theme === "dark" ? "bg-black/60" : "bg-black/35";
    const panelCls =
        theme === "dark"
            ? "bg-slate-900 shadow-2xl"
            : "border-r border-neutral-200 bg-white shadow-xl";
    const headerBorderCls = theme === "dark" ? "border-slate-700" : "border-neutral-200";
    const closeCls =
        theme === "dark"
            ? "text-slate-400 hover:text-white"
            : "text-neutral-500 hover:text-black hover:bg-neutral-100";

    return (
        <>
            {/* Hamburger Button */}
            <button
                ref={triggerRef}
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

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        data-testid="mobile-nav-backdrop"
                        className={`fixed inset-0 z-40 md:hidden ${backdropCls}`}
                        onClick={close}
                        aria-hidden="true"
                    />

                    {/* Slide-out Menu */}
                    <div
                        id="mobile-menu"
                        ref={panelRef}
                        className={`fixed top-0 left-0 z-50 flex h-full w-80 transform flex-col transition-transform duration-300 ease-in-out md:hidden ${panelCls}`}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Mobile navigation"
                    >
                        {/* Menu Header */}
                        <div className={`flex items-center justify-between border-b p-6 ${headerBorderCls}`}>
                            {logo || (
                                <span className={`text-xl font-bold ${theme === "dark" ? "text-white" : "text-black"}`}>
                                    Figaro<span className="align-super text-xs ml-1" aria-label="registered trademark">®</span> Protocol
                                </span>
                            )}
                            <button
                                onClick={close}
                                className={`rounded-lg p-2 ${closeCls} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black`}
                                aria-label="Close menu"
                            >
                                <X className="w-5 h-5" aria-hidden="true" />
                            </button>
                        </div>

                        {/* Optional top CTA — caller-controlled. MarketingHeader
                             passes `<DiscoverButton>`; (app) Header omits it so
                             the (app) drawer doesn't surface a marketing CTA. */}
                        {topCta && (
                            <div className={`border-b p-4 ${headerBorderCls}`}>
                                {topCta}
                            </div>
                        )}

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
                        block px-4 py-3 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black
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
                    </div>
                </>
            )}
        </>
    );
}
