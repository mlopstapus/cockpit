import { Menu, Wifi, WifiOff } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { useEffect, useState } from "react";

const VIEW_TITLES: Record<string, string> = {
  sessions: "Chats",
  chat: "Chat",
  accounts: "Accounts",
  settings: "Settings",
  projects: "Projects",
};

export default function Header() {
  const currentView = useCockpit((s) => s.currentView);
  const toggleSidebar = useCockpit((s) => s.toggleSidebar);
  const selectedSessionId = useCockpit((s) => s.selectedSessionId);
  const sessions = useCockpit((s) => s.sessions);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // For chat view, show session name instead
  let title = VIEW_TITLES[currentView] || "Cockpit";
  if (currentView === "chat" && selectedSessionId) {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (session) title = session.name;
  }

  return (
    <header className="flex items-center gap-3 border-b border-gray-800 bg-base px-4 py-3 md:py-4">
      <button
        onClick={toggleSidebar}
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white md:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu size={22} />
      </button>

      <h1 className="flex-1 text-base font-semibold truncate">{title}</h1>

      <div className="flex items-center gap-1.5">
        {isOnline ? (
          <Wifi size={16} className="text-green-500" />
        ) : (
          <WifiOff size={16} className="text-red-500" />
        )}
        <span className="text-xs text-gray-500 hidden sm:inline">
          {isOnline ? "Connected" : "Offline"}
        </span>
      </div>
    </header>
  );
}
