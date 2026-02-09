import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef } from "react";
import { Send, Loader } from "lucide-react";
import { api } from "../../lib/api";
export default function InputBar({ sessionId, onSendMessage, isConnected, }) {
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const inputRef = useRef(null);
    const handleSend = async () => {
        if (!message.trim() || !isConnected || isSending)
            return;
        const content = message.trim();
        setMessage("");
        setIsSending(true);
        try {
            await api.sendMessage(sessionId, content);
            onSendMessage(content);
        }
        catch (err) {
            console.error("Failed to send message:", err);
            setMessage(content); // Restore message on error
        }
        finally {
            setIsSending(false);
        }
        // Reset textarea height
        if (inputRef.current) {
            inputRef.current.style.height = "auto";
        }
    };
    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    const handleInput = (e) => {
        setMessage(e.target.value);
        // Auto-resize textarea
        const textarea = e.target;
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + "px";
    };
    return (_jsxs("div", { className: "border-t border-gray-800 bg-gray-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]", children: [_jsxs("div", { className: "flex gap-2 items-end", children: [_jsx("textarea", { ref: inputRef, value: message, onChange: handleInput, onKeyDown: handleKeyDown, placeholder: "Ask Claude something...", disabled: !isConnected || isSending, className: "flex-1 resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm placeholder-gray-500 focus:border-accent focus:outline-none disabled:opacity-50", rows: 1, maxLength: 2000 }), _jsx("button", { onClick: handleSend, disabled: !message.trim() || !isConnected || isSending, className: "flex-shrink-0 rounded-lg bg-accent px-3 py-2 text-base transition hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center", "aria-label": "Send message", children: isSending ? (_jsx(Loader, { size: 18, className: "animate-spin" })) : (_jsx(Send, { size: 18 })) })] }), _jsxs("p", { className: "mt-2 text-xs text-gray-500", children: [message.length, "/2000"] })] }));
}
