"use client";

import { useNotifications, requestNotificationPermission } from "@/lib/core/useNotifications";
import { useOrderStore } from "@/lib/core/store";
import { usePendingCommitments, awaitsMyCounterSign } from "@/hooks/core/usePendingCommitments";
import Bell from "@/components/icons/Bell";
import CheckCircle from "@/components/icons/CheckCircle";
import Package from "@/components/icons/Package";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface NotificationBellProps {
    theme?: "light" | "dark";
}

export function NotificationBell({ theme = "dark" }: NotificationBellProps) {
    const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, addNotification } = useNotifications();
    const setViewedProcessId = useOrderStore((state) => state.setViewedProcessId);
    const router = useRouter();
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    // Bridge: raise a bell notification when a commitment awaiting THIS
    // wallet's counter-sign arrives over the coordination channel. The kernel
    // has no pending state, so this is the only signal that an order needs
    // signing; the notification deep-links to /inbox where it's accepted (the
    // /inbox page renders the same arrivals as cards).
    const { pending } = usePendingCommitments(awaitsMyCounterSign);
    // Persist which pendings have already raised a notification, keyed by the
    // immutable commitment identity, so a reload (the channel replays historical
    // arrivals, and a relayed payload reads buyerSig-only even after commit)
    // doesn't re-notify the same order — each pending notifies once, ever.
    const notifiedKeys = useRef<Set<string>>(new Set());
    const notifiedHydrated = useRef(false);
    useEffect(() => {
        if (!notifiedHydrated.current) {
            notifiedHydrated.current = true;
            try {
                const stored = localStorage.getItem("figaro_notified_pending");
                if (stored) notifiedKeys.current = new Set(JSON.parse(stored) as string[]);
            } catch { /* ignore */ }
        }
        let changed = false;
        for (const p of pending) {
            const key = `${p.commitment.buyer}:${p.commitment.seller}:${p.commitment.salt}`;
            if (notifiedKeys.current.has(key)) continue;
            notifiedKeys.current.add(key);
            changed = true;
            addNotification({
                type: "commitment_pending",
                title: "New order to sign",
                message: "An order is awaiting your signature.",
                href: "/inbox",
            });
        }
        if (changed) {
            try {
                localStorage.setItem("figaro_notified_pending", JSON.stringify([...notifiedKeys.current]));
            } catch { /* ignore */ }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pending]);

    const buttonCls = theme === "dark"
        ? "relative rounded-lg p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        : "relative rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-black";
    const panelCls = theme === "dark"
        ? "bg-slate-800 border-slate-700"
        : "bg-white border-neutral-200";
    const titleCls = theme === "dark" ? "text-white" : "text-black";
    const subduedTextCls = theme === "dark" ? "text-slate-400" : "text-neutral-500";
    const strongTextCls = theme === "dark" ? "text-slate-300" : "text-neutral-700";
    const dividerCls = theme === "dark" ? "divide-slate-700 border-slate-700" : "divide-neutral-200 border-neutral-200";
    const hoverCls = theme === "dark" ? "hover:bg-slate-700/50" : "hover:bg-neutral-50";
    const unreadCls = theme === "dark" ? "bg-blue-900/20" : "bg-blue-50";
    const actionCls = theme === "dark" ? "text-blue-400 hover:text-blue-300" : "text-blue-700 hover:text-blue-800";


    const toggleOpen = () => {
        if (!isOpen) {
            requestNotificationPermission();
        }
        setIsOpen(!isOpen);
    };

    const getIcon = (type: string) => {
        switch (type) {
            case "order_committed":
                return <Package className="h-5 w-5" aria-hidden="true" />;
            case "process_resolved":
                return <CheckCircle className="h-5 w-5" aria-hidden="true" />;
            default:
                return <Bell className="h-5 w-5" aria-hidden="true" />;
        }
    };

    const handleNotificationClick = (notification: typeof notifications[number]) => {
        markAsRead(notification.id);
        if (notification.processId) {
            setViewedProcessId(notification.processId);
        }
        // Prefer an explicit deep-link (e.g. a pending commitment → /inbox);
        // otherwise the process viewer is /orders/[processId], and an
        // order-only notification falls back to the orders list.
        const target = notification.href
            ?? (notification.processId
                ? `/orders/${notification.processId}`
                : notification.orderId ? "/orders" : null);
        setIsOpen(false);
        if (target && pathname !== target) {
            router.push(target);
        }
    };

    const formatTime = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    return (
        <div className="relative" onKeyDown={(e) => { if (e.key === "Escape" && isOpen) { setIsOpen(false); } }}>
            {/* Bell Button */}
            <button
                onClick={toggleOpen}
                className={buttonCls}
                aria-label={`Notifications: ${unreadCount} unread`}
                aria-expanded={isOpen}
                aria-haspopup="true"
            >
                <Bell className="w-5 h-5" aria-hidden="true" />
                {unreadCount > 0 && (
                    <div
                        className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
                        aria-label={`${unreadCount} unread notifications`}
                    >
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </div>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        className={`absolute right-0 z-50 mt-2 flex max-h-[500px] w-96 flex-col rounded-lg border shadow-xl ${panelCls}`}
                        role="dialog"
                        aria-label="Notifications panel"
                    >
                        {/* Header */}
                        <div className={`flex items-center justify-between border-b p-4 ${dividerCls.split(" ").pop()}`}>
                            <h3 className={`font-semibold ${titleCls}`}>Notifications</h3>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        className={`text-xs ${actionCls}`}
                                    >
                                        Mark all read
                                    </button>
                                )}
                                {notifications.length > 0 && (
                                    <button
                                        onClick={clearAll}
                                        className={`text-xs ${subduedTextCls}`}
                                    >
                                        Clear all
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Notifications List */}
                        <div className="flex-1 overflow-y-auto" role="list" aria-label="Notification list">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center" role="status">
                                    <Bell className={`mx-auto mb-2 h-12 w-12 ${subduedTextCls}`} aria-hidden="true" />
                                    <p className={`text-sm ${subduedTextCls}`}>No notifications yet</p>
                                </div>
                            ) : (
                                <div className={`divide-y ${dividerCls}`}>
                                    {notifications.map((notif) => (
                                        <button
                                            key={notif.id}
                                            role="listitem"
                                            className={`w-full p-3 text-left transition-colors ${hoverCls} ${!notif.read ? unreadCls : ""
                                                }`}
                                            onClick={() => handleNotificationClick(notif)}
                                            aria-label={`${notif.read ? 'Read' : 'Unread'} notification: ${notif.title}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={theme === "dark" ? "text-slate-200" : "text-neutral-700"}>{getIcon(notif.type)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className={`text-sm font-semibold ${titleCls}`}>
                                                            {notif.title}
                                                        </p>
                                                        {!notif.read && (
                                                            <div className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0 mt-1" />
                                                        )}
                                                    </div>
                                                    <p className={`mt-0.5 text-sm ${strongTextCls}`}>
                                                        {notif.message}
                                                    </p>
                                                    <p className={`mt-1 text-xs ${subduedTextCls}`}>
                                                        {formatTime(notif.timestamp)}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
