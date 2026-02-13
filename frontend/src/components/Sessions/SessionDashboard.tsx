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
  const navigateToSession = useCockpit((s) => s.navigateToSession);

  const [isLoading, setIsLoading] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPullRef = useRef(0);
  const touchStartRef = useRef(0);

  // Pull-to-refresh detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartRef.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const endY = e.changedTouches[0].clientY;
      const diff = endY - touchStartRef.current;

      if (
        diff > 50 &&
        container.scrollTop === 0 &&
        Date.now() - lastPullRef.current > 1000
      ) {
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
    } catch (err) {
      console.error("Failed to refresh sessions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionClick = (sessionId: string) => {
    navigateToSession(sessionId);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
    >
      {isLoading && (
        <div className="sticky top-0 flex justify-center bg-base py-2 z-10">
          <RefreshCw size={16} className="animate-spin text-accent" />
        </div>
      )}

      {showTemplates ? (
        <SessionTemplatesPanel />
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <div className="text-6xl">📭</div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">No Sessions Yet</h2>
            <p className="text-sm text-gray-400">
              Create your first session to get started
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base transition hover:bg-blue-600"
          >
            <Plus size={18} />
            Create Session
          </button>
        </div>
      ) : (
        <div className="space-y-0">
          <QuickCommandsBar projectId={sessions[0]?.project_id} />
          <div className="space-y-3 p-4">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onClick={() => handleSessionClick(session.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-4 flex gap-2 pb-safe">
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-700 text-base shadow-lg transition hover:bg-gray-600 active:scale-95"
          aria-label="Toggle templates"
          title="Saved templates"
        >
          <Bookmark size={22} />
        </button>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-base shadow-lg transition hover:bg-blue-600 active:scale-95"
          aria-label="Create new session"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* New Session Modal */}
      {showNewModal && (
        <NewSessionModal
          onClose={() => setShowNewModal(false)}
          onSessionCreated={(session) => {
            setSessions([session, ...sessions]);
            handleSessionClick(session.id);
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}
