import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Bell, BellOff } from "lucide-react";
import { useNotifications } from "../../hooks/useNotifications";
import { useState } from "react";
export default function NotificationToggle() {
    const { isSupported, hasPermission, askPermission } = useNotifications();
    const [isEnabling, setIsEnabling] = useState(false);
    if (!isSupported) {
        return null;
    }
    const handleToggle = async () => {
        if (hasPermission) {
            // Can't really disable notifications from browser level
            return;
        }
        setIsEnabling(true);
        const granted = await askPermission();
        setIsEnabling(false);
        if (granted) {
            // Show a test notification
            const notification = new Notification("Notifications Enabled", {
                body: "You'll receive notifications when tasks complete",
                icon: "/icon-192.png",
            });
            setTimeout(() => notification.close(), 3000);
        }
    };
    return (_jsx("button", { onClick: handleToggle, disabled: isEnabling, className: "inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium transition hover:bg-gray-800 disabled:opacity-50", title: hasPermission
            ? "Notifications are enabled"
            : "Enable notifications for task completion alerts", children: hasPermission ? (_jsxs(_Fragment, { children: [_jsx(Bell, { size: 14, className: "text-accent" }), "Notifications On"] })) : (_jsxs(_Fragment, { children: [_jsx(BellOff, { size: 14 }), "Enable Notifications"] })) }));
}
