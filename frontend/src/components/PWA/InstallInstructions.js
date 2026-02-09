import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Share2 } from "lucide-react";
export default function InstallInstructions() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) {
        return null;
    }
    return (_jsx("div", { className: "space-y-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3", children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx(Share2, { size: 16, className: "mt-0.5 flex-shrink-0 text-blue-400" }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-medium text-white", children: "Install on iPhone" }), _jsxs("ol", { className: "mt-1 space-y-1 text-xs text-gray-400", children: [_jsxs("li", { children: ["1. Tap the Share button ", _jsx(Share2, { size: 12, className: "inline" })] }), _jsx("li", { children: "2. Scroll down and tap \"Add to Home Screen\"" }), _jsx("li", { children: "3. Tap \"Add\" to confirm" })] })] })] }) }));
}
