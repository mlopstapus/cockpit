import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Wifi, WifiOff, Lock, AlertCircle } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { useEffect, useState } from "react";
export default function StatusBar() {
    const accounts = useCockpit((s) => s.accounts);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);
    const primaryAccount = accounts[0];
    const usagePercent = primaryAccount?.usage_pct || 0;
    const authStatus = primaryAccount?.auth_status;
    return (_jsxs("div", { className: "flex items-center justify-between border-b border-gray-800 bg-base px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-2", children: [isOnline ? (_jsx(Wifi, { size: 16, className: "text-green-500" })) : (_jsx(WifiOff, { size: 16, className: "text-red-500" })), _jsx("span", { className: "text-sm text-gray-400", children: isOnline ? "Connected" : "Offline" })] }), primaryAccount && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("div", { className: "flex flex-col items-end gap-0", children: [_jsx("span", { className: "text-xs text-gray-300", children: primaryAccount.name }), _jsxs("span", { className: "text-xs text-gray-500", children: [Math.round(usagePercent), "%"] })] }), authStatus === "needs_auth" ? (_jsx("div", { className: "h-8 w-8 rounded-full border-2 border-red-500 bg-red-950 flex items-center justify-center", children: _jsx(Lock, { size: 14, className: "text-red-300" }) })) : authStatus === "authenticating" ? (_jsx("div", { className: "h-8 w-8 rounded-full border-2 border-yellow-500 bg-yellow-950 flex items-center justify-center animate-pulse", children: _jsx(AlertCircle, { size: 14, className: "text-yellow-300" }) })) : (_jsxs("div", { className: "h-8 w-8 rounded-full border-2 border-gray-700 bg-gray-900 flex items-center justify-center overflow-hidden", children: [_jsx("div", { className: "h-full bg-accent", style: {
                                    width: `${usagePercent}%`,
                                    fontSize: 0,
                                } }), _jsx("span", { className: "absolute text-xs font-bold text-white", children: Math.round(usagePercent) })] }))] }))] }));
}
