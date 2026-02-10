import { useState } from "react";
import { Plus } from "lucide-react";
import { useCockpit } from "../../lib/store";
import NewSessionModal from "../Sessions/NewSessionModal";

export default function WelcomeScreen() {
  const [showNewModal, setShowNewModal] = useState(false);
  const setSessions = useCockpit((s) => s.setSessions);
  const sessions = useCockpit((s) => s.sessions);
  const navigateToSession = useCockpit((s) => s.navigateToSession);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <div className="flex flex-col items-center gap-6 -mt-16">
        <img
          src="/icon-192.png"
          alt="Cockpit"
          className="h-16 w-16 rounded-2xl"
        />
        <h2 className="text-2xl font-semibold text-gray-200 text-center">
          How can I help you?
        </h2>
        <p className="text-sm text-gray-500 text-center max-w-xs">
          Start a new session to chat with Claude Code on any of your repos.
        </p>
        <button
          onClick={() => setShowNewModal(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 active:scale-95"
        >
          <Plus size={18} />
          New Session
        </button>
      </div>

      {showNewModal && (
        <NewSessionModal
          onClose={() => setShowNewModal(false)}
          onSessionCreated={(session) => {
            setSessions([session, ...sessions]);
            navigateToSession(session.id);
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}
