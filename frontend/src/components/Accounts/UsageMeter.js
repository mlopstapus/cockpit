import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function UsageMeter({ account }) {
    const percentage = Math.min(account.usage_pct, 100);
    const getColor = (pct) => {
        if (pct < 50)
            return "bg-green-500";
        if (pct < 80)
            return "bg-yellow-500";
        return "bg-red-500";
    };
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between text-xs", children: [_jsx("span", { className: "text-gray-400", children: "Usage" }), _jsxs("span", { className: "font-semibold text-gray-200", children: [Math.round(percentage), "%"] })] }), _jsx("div", { className: "h-2 w-full rounded-full bg-gray-800 overflow-hidden", children: _jsx("div", { className: `h-full transition-all duration-300 ${getColor(percentage)}`, style: { width: `${percentage}%` } }) })] }));
}
