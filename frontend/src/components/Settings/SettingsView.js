import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { RotateCcw, Info, Github, CheckCircle } from "lucide-react";
import { useState } from "react";
import InstallInstructions from "../PWA/InstallInstructions";
import NotificationToggle from "../PWA/NotificationToggle";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";
export default function SettingsView() {
    const [clearedCache, setClearedCache] = useState(false);
    const { isInstalled, canInstall } = useInstallPrompt();
    const handleClearCache = () => {
        // Clear localStorage
        localStorage.clear();
        // Clear service worker cache
        if ("caches" in window) {
            caches.keys().then((names) => {
                names.forEach((name) => {
                    caches.delete(name);
                });
            });
        }
        setClearedCache(true);
        setTimeout(() => setClearedCache(false), 2000);
    };
    return (_jsxs("div", { className: "space-y-4 p-4", children: [_jsxs("div", { className: "rounded-lg border border-gray-800 bg-gray-900 p-4", children: [_jsx("h3", { className: "mb-3 text-sm font-semibold", children: "Device" }), _jsxs("div", { className: "space-y-2 text-xs text-gray-400", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "User Agent" }), _jsx("span", { className: "text-gray-300 text-right break-words flex-1 ml-2", children: navigator.userAgent })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Online Status" }), _jsx("span", { className: navigator.onLine ? "text-green-400" : "text-red-400", children: navigator.onLine ? "Online" : "Offline" })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Storage" }), _jsx("span", { className: "text-gray-300", children: "Available" })] })] })] }), isInstalled ? (_jsx("div", { className: "rounded-lg border border-green-500/30 bg-green-500/5 p-4", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx(CheckCircle, { size: 18, className: "text-green-400 flex-shrink-0 mt-0.5" }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold text-white", children: "Installed" }), _jsx("p", { className: "text-xs text-gray-400 mt-1", children: "Running as standalone app. Works offline! \uD83D\uDCF1" })] })] }) })) : canInstall ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "rounded-lg border border-blue-500/30 bg-blue-500/5 p-4", children: [_jsx("h3", { className: "mb-3 text-sm font-semibold", children: "Get App Experience" }), _jsx("p", { className: "text-xs text-gray-400 mb-3", children: "Install to homescreen for faster access and offline capability." }), _jsx("button", { className: "w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600", children: "Install App" })] }), _jsx(InstallInstructions, {})] })) : null, _jsxs("div", { className: "rounded-lg border border-gray-800 bg-gray-900 p-4", children: [_jsx("h3", { className: "mb-3 text-sm font-semibold", children: "Notifications" }), _jsx(NotificationToggle, {})] }), _jsx("div", { className: "space-y-2", children: _jsxs("button", { onClick: handleClearCache, className: "w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium transition hover:bg-gray-800", children: [_jsx(RotateCcw, { size: 16 }), clearedCache ? "Cache cleared" : "Clear cache"] }) }), _jsx("div", { className: "rounded-lg border border-gray-800 bg-gray-900 p-4", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx(Info, { size: 18, className: "flex-shrink-0 mt-0.5 text-accent" }), _jsxs("div", { className: "text-xs text-gray-400 space-y-2", children: [_jsx("p", { children: _jsx("strong", { children: "Claude Cockpit v0.1.0" }) }), _jsx("p", { children: "Manage your Claude Code agent sessions from your phone, running on your NUC over Tailscale." }), _jsxs("a", { href: "https://github.com/anthropics/claude-code", target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center gap-1 text-accent hover:underline", children: [_jsx(Github, { size: 14 }), "GitHub"] })] })] }) })] }));
}
