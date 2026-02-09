import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Circle, X } from "lucide-react";
const statusIndicators = {
    starting: { color: "text-yellow-500", label: "Starting" },
    running: { color: "text-green-500", label: "Running" },
    idle: { color: "text-blue-500", label: "Idle" },
    rate_limited: { color: "text-orange-500", label: "Rate Limited" },
    error: { color: "text-red-500", label: "Error" },
    stopped: { color: "text-gray-500", label: "Stopped" },
};
export default function SessionCard({ session, onClick, onStop, }) {
    const status = statusIndicators[session.status];
    const timeSinceUpdate = new Date(session.last_activity);
    const timeAgo = getTimeAgo(timeSinceUpdate);
    return (_jsx("div", { onClick: onClick, className: "cursor-pointer rounded-lg border border-gray-800 bg-gray-900 p-4 transition hover:border-accent hover:bg-gray-800 active:scale-95", children: _jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h3", { className: "truncate text-sm font-semibold", children: session.name }), _jsx(Circle, { size: 8, className: `flex-shrink-0 ${status.color}` })] }), _jsx("p", { className: "text-xs text-gray-400", children: session.repo_name }), _jsxs("p", { className: "mt-2 text-xs text-gray-500 line-clamp-2", children: [timeAgo, session.message_count > 0 && ` • ${session.message_count} messages`] })] }), onStop && (_jsx("button", { onClick: (e) => {
                        e.stopPropagation();
                        onStop(session.id);
                    }, className: "flex-shrink-0 rounded p-2 text-gray-400 transition hover:bg-gray-800 hover:text-red-500", "aria-label": "Stop session", children: _jsx(X, { size: 18 }) }))] }) }));
}
function getTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60)
        return "Just now";
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400)
        return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
