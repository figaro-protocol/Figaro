"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { MobileNav } from "@/components/shared/MobileNav";
import { useWalletConnected } from "@/hooks/useWalletConnected";
import { NAV_LINKS } from "@/components/shared/navLinks";

export function Header() {
    const walletConnected = useWalletConnected();
    return (
        <header className="border-b border-gray-300 bg-white/80 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-6 py-5 flex items-center justify-between gap-3">
                {/* Left: mobile hamburger + logo */}
                <div className="flex items-center gap-2">
                    <MobileNav theme="light" />
                    <Link href="/" className="flex items-center gap-2">
                        <span className="text-xl md:text-2xl font-bold">Figaro<span className="align-super text-xs ml-1">®</span> Protocol</span>
                    </Link>
                </div>
                {/* Center: desktop-only nav links */}
                <nav className="hidden md:flex flex-1 justify-center items-center gap-6 text-sm" data-testid="desktop-nav">
                    {NAV_LINKS.map(link => (
                        <Link key={link.href} href={link.href} className="hover:underline px-2 py-1 rounded transition-colors">
                            {link.label}
                        </Link>
                    ))}
                </nav>
                {/* Right: wallet connect + notification bell */}
                <div className="flex items-center gap-3">
                    {walletConnected && <NotificationBell theme="light" />}
                    <ConnectButton />
                </div>
            </div>
        </header>
    );
}

