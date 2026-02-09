import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { ChevronLeft, Loader } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { useSessionWebSocket } from "../../hooks/useWebSocket";
import { useNotifications } from "../../hooks/useNotifications";
import { ANSIRenderer } from "./ANSIRenderer";
import InputBar from "./InputBar";
import MessageBubble from "./MessageBubble";
export default function ChatView() {
    const selectedSessionId = useCockpit((s) => s.selectedSessionId);
    const sessions = useCockpit((s) => s.sessions);
    const setActiveTab = useCockpit((s) => s.setActiveTab);
    const setSelectedSessionId = useCockpit((s) => s.setSelectedSessionId);
    const { messages, outputBuffer, isConnected, sendMessage } = useSessionWebSocket(selectedSessionId);
    const { sendNotification, hasPermission } = useNotifications();
    const lastNotifiedRef = useRef(null);
    const messagesEndRef = useRef(null);
    // Auto-scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, outputBuffer]);
    // Send notification on task completion
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage &&
            lastMessage.type === "task_complete" &&
            lastNotifiedRef.current !== lastMessage.timestamp &&
            hasPermission) {
            lastNotifiedRef.current = lastMessage.timestamp;
            const body = typeof lastMessage.data?.summary === "string"
                ? lastMessage.data.summary
                : "Claude has finished processing your request";
            sendNotification({
                title: "Task Complete",
                body,
                icon: "/icon-192.png",
                tag: "task-complete",
            });
        }
    }, [messages, hasPermission, sendNotification]);
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (!session) {
        return (_jsx("div", { className: "flex items-center justify-center h-full", children: _jsx("p", { className: "text-gray-400", children: "Session not found" }) }));
    }
    const handleBack = () => {
        setSelectedSessionId(null);
        setActiveTab("sessions");
    };
    return (_jsxs("div", { className: "flex h-full flex-col", children: [_jsx("div", { className: "border-b border-gray-800 bg-gray-900 px-4 py-3", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: handleBack, className: "rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-white", children: _jsx(ChevronLeft, { size: 24 }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h1", { className: "truncate text-sm font-semibold", children: session.name }), _jsx("p", { className: "text-xs text-gray-400", children: session.repo_name })] }), _jsx("div", { className: "flex items-center gap-1", children: isConnected ? (_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "h-2 w-2 rounded-full bg-green-500 animate-pulse" }), _jsx("span", { className: "text-xs text-gray-400", children: "Live" })] })) : (_jsx("span", { className: "text-xs text-gray-500", children: "Offline" })) })] }) }), _jsx("div", { className: "flex-1 overflow-y-auto space-y-4 p-4", children: messages.length === 0 && !outputBuffer ? (_jsxs("div", { className: "flex flex-col items-center justify-center gap-2 py-12", children: [_jsx(Loader, { size: 24, className: "animate-spin text-accent" }), _jsx("p", { className: "text-sm text-gray-400", children: "Waiting for Claude..." })] })) : (_jsxs(_Fragment, { children: [messages.map((msg) => (_jsx(MessageBubble, { message: msg }, `${msg.timestamp}-${msg.type}`))), outputBuffer && (_jsxs("div", { className: "rounded-lg bg-gray-800 p-3 text-sm text-gray-100", children: [_jsx("p", { className: "text-xs font-mono text-gray-500 mb-2", children: "OUTPUT" }), _jsx("pre", { className: "font-mono whitespace-pre-wrap break-words text-xs leading-relaxed", children: _jsx(ANSIRenderer, { text: outputBuffer }) })] })), isConnected && outputBuffer && (_jsxs("div", { className: "flex items-center gap-2 text-xs text-gray-500", children: [_jsx("span", { className: "h-1 w-1 rounded-full bg-accent animate-pulse" }), "Claude is thinking..."] })), _jsx("div", { ref: messagesEndRef })] })) }), selectedSessionId && (_jsx(InputBar, { sessionId: selectedSessionId, onSendMessage: sendMessage, isConnected: isConnected }))] }));
}
