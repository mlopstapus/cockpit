import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ANSIRenderer } from "./ANSIRenderer";
export default function MessageBubble({ message }) {
    const isError = message.type === "error";
    const isStatus = message.type === "status";
    const isOutput = message.type === "output";
    if (isStatus) {
        return (_jsx("div", { className: "flex justify-center", children: _jsx("div", { className: "rounded-lg bg-blue-950 px-3 py-1 text-center text-xs text-blue-200", children: message.data.content }) }));
    }
    if (isError) {
        return (_jsxs("div", { className: "rounded-lg border border-red-900 bg-red-950 p-3", children: [_jsx("p", { className: "text-xs font-semibold text-red-200", children: "Error" }), _jsx("p", { className: "mt-1 text-sm text-red-100", children: message.data.content })] }));
    }
    if (isOutput) {
        return (_jsxs("div", { className: "rounded-lg bg-gray-800 p-3", children: [_jsx("p", { className: "mb-2 text-xs font-mono text-gray-500", children: "OUTPUT" }), _jsx("pre", { className: "font-mono text-xs leading-relaxed text-gray-200 whitespace-pre-wrap break-words", children: _jsx(ANSIRenderer, { text: message.data.content }) })] }));
    }
    return (_jsxs("div", { className: "rounded-lg bg-gray-800 p-3", children: [_jsx("p", { className: "text-sm text-gray-200", children: message.data.content }), _jsx("p", { className: "mt-2 text-xs text-gray-500", children: new Date(message.timestamp).toLocaleTimeString() })] }));
}
