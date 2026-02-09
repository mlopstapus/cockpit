import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState, useEffect } from "react";
import { Plus, RefreshCw, Bookmark } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { api } from "../../lib/api";
import SessionCard from "./SessionCard";
import NewSessionModal from "./NewSessionModal";
import QuickCommandsBar from "./QuickCommandsBar";
import SessionTemplatesPanel from "./SessionTemplatesPanel";
export default function SessionDashboard() {
    const sessions = useCockpit((s) => s.sessions);
    const setSessions = useCockpit((s) => s.setSessions);
    const setSelectedSessionId = useCockpit((s) => s.setSelectedSessionId);
    const setActiveTab = useCockpit((s) => s.setActiveTab);
    const [isLoading, setIsLoading] = useState(false);
    const [showNewModal, setShowNewModal] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const containerRef = useRef(null);
    const lastPullRef = useRef(0);
    const touchStartRef = useRef(0);
    // Pull-to-refresh detection
    useEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;
        const handleTouchStart = (e) => {
            touchStartRef.current = e.touches[0].clientY;
        };
        const handleTouchEnd = (e) => {
            const endY = e.changedTouches[0].clientY;
            const diff = endY - touchStartRef.current;
            if (diff > 50 &&
                container.scrollTop === 0 &&
                Date.now() - lastPullRef.current > 1000) {
                refreshSessions();
            }
        };
        container.addEventListener("touchstart", handleTouchStart);
        container.addEventListener("touchend", handleTouchEnd);
        return () => {
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchend", handleTouchEnd);
        };
    }, []);
    const refreshSessions = async () => {
        setIsLoading(true);
        lastPullRef.current = Date.now();
        try {
            const updated = await api.listSessions();
            setSessions(updated);
        }
        catch (err) {
            console.error("Failed to refresh sessions:", err);
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleSessionClick = (sessionId) => {
        setSelectedSessionId(sessionId);
        setActiveTab("chat");
    };
    return (_jsxs("div", { ref: containerRef, className: "relative h-full overflow-y-auto", children: [isLoading && (_jsx("div", { className: "sticky top-0 flex justify-center bg-base py-2 z-10", children: _jsx(RefreshCw, { size: 16, className: "animate-spin text-accent" }) })), showTemplates ? (_jsx(SessionTemplatesPanel, {})) : sessions.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center gap-4 py-16", children: [_jsx("div", { className: "text-6xl", children: "\uD83D\uDCED" }), _jsxs("div", { className: "text-center", children: [_jsx("h2", { className: "text-lg font-semibold", children: "No Sessions Yet" }), _jsx("p", { className: "text-sm text-gray-400", children: "Create your first session to get started" })] }), _jsxs("button", { onClick: () => setShowNewModal(true), className: "mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base transition hover:bg-blue-600", children: [_jsx(Plus, { size: 18 }), "Create Session"] })] })) : (_jsxs("div", { className: "space-y-0", children: [_jsx(QuickCommandsBar, { repoName: sessions[0]?.repo_name }), _jsx("div", { className: "space-y-3 p-4", children: sessions.map((session) => (_jsx(SessionCard, { session: session, onClick: () => handleSessionClick(session.id) }, session.id))) })] })), _jsxs("div", { className: "fixed bottom-24 right-4 flex gap-2", children: [_jsx("button", { onClick: () => setShowTemplates(!showTemplates), className: "flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 text-base shadow-lg transition hover:bg-gray-600 active:scale-95", "aria-label": "Toggle templates", title: "Saved templates", children: _jsx(Bookmark, { size: 22 }) }), _jsx("button", { onClick: () => setShowNewModal(true), className: "flex h-14 w-14 items-center justify-center rounded-full bg-accent text-base shadow-lg transition hover:bg-blue-600 active:scale-95", "aria-label": "Create new session", children: _jsx(Plus, { size: 24 }) })] }), showNewModal && (_jsx(NewSessionModal, { onClose: () => setShowNewModal(false), onSessionCreated: (session) => {
                    setSessions([session, ...sessions]);
                    handleSessionClick(session.id);
                    setShowNewModal(false);
                } }))] }));
}
