import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Loader } from "lucide-react";
import { createAuthSocket } from "../../lib/api";
import { ANSIRenderer } from "../Chat/ANSIRenderer";
export default function AuthTerminal({ accountId, onSuccess, onCancel, }) {
    const wsRef = useRef(null);
    const [output, setOutput] = useState("");
    const [inputValue, setInputValue] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const [error, setError] = useState(null);
    const scrollRef = useRef(null);
    useEffect(() => {
        const ws = createAuthSocket(accountId);
        wsRef.current = ws;
        ws.onopen = () => {
            setIsConnected(true);
            setError(null);
        };
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === "output") {
                    setOutput((prev) => prev + (data.content || ""));
                }
                else if (data.type === "status") {
                    if (data.status === "authenticated") {
                        setIsDone(true);
                        setTimeout(onSuccess, 1000);
                    }
                }
                else if (data.type === "error") {
                    setError(data.message || "Authentication error");
                }
            }
            catch (err) {
                console.error("Failed to parse WebSocket message:", err);
            }
        };
        ws.onerror = () => {
            setError("WebSocket connection error");
            setIsConnected(false);
        };
        ws.onclose = () => {
            setIsConnected(false);
        };
        return () => {
            ws.close();
        };
    }, [accountId, onSuccess]);
    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [output]);
    const handleSendInput = () => {
        if (inputValue.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: "input",
                content: inputValue,
            }));
            setInputValue("");
        }
    };
    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSendInput();
        }
    };
    return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { ref: scrollRef, className: "h-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-200", children: [output ? (_jsx(ANSIRenderer, { text: output, className: "whitespace-pre-wrap break-words" })) : (_jsx("p", { className: "text-gray-500", children: "Connecting to authentication service..." })), isDone && (_jsx("div", { className: "mt-2 text-green-400", children: "\u2705 Authentication successful!" }))] }), error && (_jsx("div", { className: "rounded-lg border border-red-900 bg-red-950 p-2 text-xs text-red-200", children: error })), !isDone && isConnected && (_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", value: inputValue, onChange: (e) => setInputValue(e.target.value), onKeyDown: handleKeyDown, placeholder: "Type your response...", disabled: !isConnected, className: "flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-accent focus:outline-none disabled:opacity-50" }), _jsx("button", { onClick: handleSendInput, disabled: !inputValue.trim() || !isConnected, className: "rounded-lg bg-accent px-3 py-2 text-xs font-medium text-base transition hover:bg-blue-600 disabled:opacity-50", children: "Send" })] })), isDone && (_jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: onCancel, className: "flex-1 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium transition hover:bg-gray-800", children: "Close" }), _jsx("button", { onClick: onSuccess, className: "flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-700", children: "Done" })] })), !isConnected && !isDone && (_jsxs("div", { className: "flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 py-3 text-xs text-gray-400", children: [_jsx(Loader, { size: 14, className: "animate-spin" }), "Connecting..."] }))] }));
}
