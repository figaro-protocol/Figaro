"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { CORE_ABI } from "./contracts";
import { CONTRACTS } from "./contracts";
import { ensureRpc } from "@/lib/shared/rpc";
import { isE2EMockSession } from "@/lib/shared/e2e";


export interface Notification {
    id: string;
    type: "order_committed" | "process_resolved" | "commitment_pending";
    title: string;
    message: string;
    timestamp: number;
    orderId?: string;
    processId?: string;
    /** Explicit deep-link target. When set, the bell navigates here on click
     *  instead of deriving a target from processId/orderId — used for pending
     *  commitments, which have no on-chain process yet (→ /inbox to sign). */
    href?: string;
    read: boolean;
}

let notificationIdCounter = 0;

export function useNotifications() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const publicClient = usePublicClient();
    const isE2EMock = isE2EMockSession();

    // Load from localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = localStorage.getItem("figaro_notifications");
        if (stored) {
            try {
                setNotifications(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse notifications:", e);
            }
        }
    }, []);

    // Save to localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        localStorage.setItem("figaro_notifications", JSON.stringify(notifications));
    }, [notifications]);

    const addNotification = (notification: Omit<Notification, "id" | "timestamp" | "read">) => {
        const newNotification: Notification = {
            ...notification,
            id: `notif-${++notificationIdCounter}-${Date.now()}`,
            timestamp: Date.now(),
            read: false,
        };

        setNotifications((prev) => [newNotification, ...prev].slice(0, 50)); // Keep last 50

        // Show browser notification if permitted
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            new Notification(notification.title, {
                body: notification.message,
                icon: "/favicon.ico",
            });
        }
    };

    const markAsRead = (id: string) => {
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
    };

    const markAllAsRead = () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const clearAll = () => {
        setNotifications([]);
    };

    // Listen for OrderCommitted events (only start watcher when RPC is available)
    useEffect(() => {
        if (!publicClient || isE2EMock) return;
        let unwatch: (() => void) | undefined;
        let mounted = true;

        const startWatcher = async () => {
            const rpcCheck = await ensureRpc(publicClient);
            if (!rpcCheck.ok) return;

            unwatch = publicClient.watchContractEvent({
                address: CONTRACTS.core as `0x${string}`,
                abi: CORE_ABI,
                eventName: "OrderCommitted",
                onLogs: (logs) => {
                    if (!mounted) return;
                    logs.forEach((log) => {
                        const { args } = log;
                        addNotification({
                            type: "order_committed",
                            title: "New order placed",
                            message: `Order ${(args.orderHash as string)?.slice(2, 8).toUpperCase()}… placed`,
                            orderId: args.orderHash as string,
                            processId: args.processId as string,
                        });
                    });
                },
            });
        };

        startWatcher();

        return () => {
            mounted = false;
            if (unwatch) unwatch();
        };
    }, [publicClient, isE2EMock]);

    // Listen for ProcessResolved events (only when RPC is available)
    useEffect(() => {
        if (!publicClient || isE2EMock) return;
        let unwatch: (() => void) | undefined;
        let mounted = true;

        const startWatcher = async () => {
            const rpcCheck = await ensureRpc(publicClient);
            if (!rpcCheck.ok) return;

            unwatch = publicClient.watchContractEvent({
                address: CONTRACTS.core as `0x${string}`,
                abi: CORE_ABI,
                eventName: "ProcessResolved",
                onLogs: (logs) => {
                    if (!mounted) return;
                    logs.forEach((log) => {
                        const { args } = log;
                        addNotification({
                            type: "process_resolved",
                            title: "✅ Order Complete",
                            message: `Order ${(args.processId as string)?.slice(2, 8).toUpperCase()}… settled — deposits returned`,
                            processId: args.processId as string,
                        });
                    });
                },
            });
        };

        startWatcher();

        return () => {
            mounted = false;
            if (unwatch) unwatch();
        };
    }, [publicClient, isE2EMock]);

    const unreadCount = notifications.filter((n) => !n.read).length;

    return {
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
    };
}

// Request notification permission
export function requestNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "default") {
        Notification.requestPermission();
    }
}
