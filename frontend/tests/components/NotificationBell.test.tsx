import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => {
    const baseNotifications: Array<{
        id: string; type: string; title: string; message: string;
        timestamp: number; orderId?: string; processId?: string; href?: string;
    }> = [
        {
            id: "notif-1",
            type: "order_committed",
            title: "New Order Committed",
            message: "Order 0x1234 committed",
            timestamp: Date.now(),
            orderId: "0x1234",
            processId: "0xprocess",
        },
    ];
    return {
        baseNotifications,
        notificationsState: { notifications: baseNotifications, unreadCount: 1 },
        pushMock: vi.fn(),
        pathnameMock: vi.fn(),
        setViewedProcessIdMock: vi.fn(),
        markAsReadMock: vi.fn(),
        markAllAsReadMock: vi.fn(),
        clearAllMock: vi.fn(),
        requestNotificationPermissionMock: vi.fn(),
    };
});

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: mocks.pushMock,
        replace: vi.fn(),
        prefetch: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => mocks.pathnameMock(),
}));
vi.mock("@/lib/core/useNotifications", () => ({
    useNotifications: () => ({
        notifications: mocks.notificationsState.notifications,
        unreadCount: mocks.notificationsState.unreadCount,
        markAsRead: mocks.markAsReadMock,
        markAllAsRead: mocks.markAllAsReadMock,
        clearAll: mocks.clearAllMock,
        addNotification: vi.fn(),
    }),
    requestNotificationPermission: mocks.requestNotificationPermissionMock,
}));
vi.mock("@/lib/core/store", () => ({
    useOrderStore: (selector: (state: { setViewedProcessId: typeof mocks.setViewedProcessIdMock }) => unknown) =>
        selector({ setViewedProcessId: mocks.setViewedProcessIdMock }),
}));
// The bell subscribes to the coordination channel for pending arrivals; that
// path (wagmi + runtime services) is exercised by the devnet e2e, not here.
vi.mock("@/hooks/core/usePendingCommitments", () => ({
    usePendingCommitments: () => ({ pending: [], dismiss: vi.fn() }),
    awaitsMyCounterSign: () => false,
}));

import { NotificationBell } from "@/components/shared/NotificationBell";

describe("NotificationBell", () => {
    beforeEach(() => {
        mocks.notificationsState = {
            notifications: mocks.baseNotifications,
            unreadCount: 1,
        };
        mocks.pathnameMock.mockReturnValue("/");
        (window as Window & { __FIGARO_HAS_UNSAVED_BUILDER_DRAFT__?: boolean }).__FIGARO_HAS_UNSAVED_BUILDER_DRAFT__ = false;
        mocks.pushMock.mockReset();
        mocks.setViewedProcessIdMock.mockReset();
        mocks.markAsReadMock.mockReset();
        mocks.markAllAsReadMock.mockReset();
        mocks.clearAllMock.mockReset();
        mocks.requestNotificationPermissionMock.mockReset();
    });

    it("opens the panel and requests notification permission when first opened", async () => {
        const user = userEvent.setup();
        render(<NotificationBell />);
        await user.click(screen.getByRole("button", { name: /notifications: 1 unread/i }));
        expect(mocks.requestNotificationPermissionMock).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("dialog", { name: /notifications panel/i })).toBeInTheDocument();
        expect(screen.getByText("New Order Committed")).toBeInTheDocument();
    });

    it("marks a notification as read, selects the process, and routes to the order page", async () => {
        const user = userEvent.setup();
        render(<NotificationBell />);
        await user.click(screen.getByRole("button", { name: /notifications: 1 unread/i }));
        await user.click(screen.getByLabelText(/unread notification: new order committed/i));
        expect(mocks.markAsReadMock).toHaveBeenCalledWith("notif-1");
        expect(mocks.setViewedProcessIdMock).toHaveBeenCalledWith("0xprocess");
        expect(mocks.pushMock).toHaveBeenCalledWith("/orders/0xprocess");
    });

    it("does not push when already on the order page", async () => {
        mocks.pathnameMock.mockReturnValue("/orders/0xprocess");
        const user = userEvent.setup();
        render(<NotificationBell />);
        await user.click(screen.getByRole("button", { name: /notifications: 1 unread/i }));
        await user.click(screen.getByLabelText(/unread notification: new order committed/i));
        expect(mocks.markAsReadMock).toHaveBeenCalledWith("notif-1");
        expect(mocks.setViewedProcessIdMock).toHaveBeenCalledWith("0xprocess");
        expect(mocks.pushMock).not.toHaveBeenCalled();
    });

    it("routes to an explicit href when set (pending commitment → /inbox)", async () => {
        mocks.notificationsState = {
            notifications: [{
                id: "notif-pending",
                type: "commitment_pending" as const,
                title: "New order to sign",
                message: "An order is awaiting your signature.",
                href: "/inbox",
                timestamp: Date.now(),
            }],
            unreadCount: 1,
        };
        const user = userEvent.setup();
        render(<NotificationBell />);
        await user.click(screen.getByRole("button", { name: /notifications: 1 unread/i }));
        await user.click(screen.getByLabelText(/unread notification: new order to sign/i));
        expect(mocks.markAsReadMock).toHaveBeenCalledWith("notif-pending");
        expect(mocks.pushMock).toHaveBeenCalledWith("/inbox");
    });

    it("shows empty state controls correctly", async () => {
        mocks.notificationsState = {
            notifications: [],
            unreadCount: 0,
        };
        const user = userEvent.setup();
        render(<NotificationBell />);
        await user.click(screen.getByRole("button", { name: /notifications: 0 unread/i }));
        expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /mark all read/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /clear all/i })).not.toBeInTheDocument();
    });
});
