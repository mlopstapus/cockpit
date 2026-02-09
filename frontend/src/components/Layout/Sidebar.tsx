import { useRef, useEffect, useCallback } from "react";
import {
  MessageSquare,
  FolderOpen,
  Settings,
  Plus,
  X,
  ChevronRight,
} from "lucide-react";
import { useCockpit, type ViewName } from "../../lib/store";

const PROJECT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

export default function Sidebar() {
  const sidebarOpen = useCockpit((s) => s.sidebarOpen);
  const setSidebarOpen = useCockpit((s) => s.setSidebarOpen);
  const currentView = useCockpit((s) => s.currentView);
  const setCurrentView = useCockpit((s) => s.setCurrentView);
  const sessions = useCockpit((s) => s.sessions);
  const projects = useCockpit((s) => s.projects);
  const accounts = useCockpit((s) => s.accounts);
  const navigateToProject = useCockpit((s) => s.navigateToProject);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);

  // Swipe-from-left-edge to open
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch.clientX < 20) {
        touchStartXRef.current = touch.clientX;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartXRef.current === null) return;
      const touch = e.touches[0];
      const diff = touch.clientX - touchStartXRef.current;
      if (diff > 60) {
        setSidebarOpen(true);
        touchStartXRef.current = null;
      }
    };

    const handleTouchEnd = () => {
      touchStartXRef.current = null;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [setSidebarOpen]);

  const handleNavClick = useCallback(
    (view: ViewName) => {
      setCurrentView(view);
    },
    [setCurrentView]
  );

  const primaryAccount = accounts[0];
  const activeSessions = sessions.filter(
    (s) => s.status === "running" || s.status === "starting"
  );

  return (
    <>
      {/* Overlay backdrop (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        ref={sidebarRef}
        className={`
          fixed top-0 left-0 z-50 h-full w-72 bg-[#111111] border-r border-gray-800
          flex flex-col transition-transform duration-200 ease-out
          md:relative md:translate-x-0 md:z-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Header — logo + close button */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt="Cockpit"
              className="h-8 w-8 rounded-lg"
            />
            <span className="text-lg font-bold tracking-tight">Cockpit</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* Main nav section — scrollable */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* Chats */}
          <NavItem
            icon={<MessageSquare size={20} />}
            label="Chats"
            active={currentView === "sessions"}
            badge={activeSessions.length > 0 ? activeSessions.length : undefined}
            onClick={() => handleNavClick("sessions")}
          />

          {/* Projects section */}
          <div className="mt-4 px-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Projects
              </span>
              <button
                onClick={() => handleNavClick("projects")}
                className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white"
                title="New project"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {projects.length > 0 ? (
            <div className="mt-1">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => navigateToProject(project.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800/60 transition-colors"
                >
                  <div
                    className="h-5 w-5 rounded flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: project.color || PROJECT_COLORS[0] }}
                  >
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate">{project.name}</span>
                  {project.session_count > 0 && (
                    <span className="ml-auto text-xs text-gray-500">
                      {project.session_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3">
              <button
                onClick={() => handleNavClick("projects")}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-700 px-3 py-2 text-xs text-gray-500 hover:border-gray-600 hover:text-gray-400 transition-colors"
              >
                <FolderOpen size={14} />
                New project
              </button>
            </div>
          )}

          {/* Recent sessions (standalone / no project) */}
          {sessions.length > 0 && (
            <div className="mt-4">
              <div className="px-4 mb-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Recent
                </span>
              </div>
              {sessions.slice(0, 8).map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    useCockpit.getState().navigateToSession(session.id);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800/60 transition-colors"
                >
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      session.status === "running"
                        ? "bg-green-500"
                        : session.status === "error"
                        ? "bg-red-500"
                        : "bg-gray-600"
                    }`}
                  />
                  <span className="truncate">{session.name}</span>
                  <ChevronRight size={14} className="ml-auto text-gray-600" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom section — Settings + Profile */}
        <div className="border-t border-gray-800 p-3 space-y-1">
          <NavItem
            icon={<Settings size={20} />}
            label="Settings"
            active={currentView === "settings"}
            onClick={() => handleNavClick("settings")}
          />

          {/* Profile / Account */}
          {primaryAccount && (
            <button
              onClick={() => handleNavClick("accounts")}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-800/60 transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                {primaryAccount.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-gray-300 truncate">
                  {primaryAccount.name}
                </p>
                <p className="text-xs text-gray-500">
                  {Math.round(primaryAccount.usage_pct)}% used
                </p>
              </div>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg mx-2 px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-gray-800 text-white font-medium"
          : "text-gray-400 hover:bg-gray-800/60 hover:text-white"
      }`}
      style={{ width: "calc(100% - 1rem)" }}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/20 px-1.5 text-xs font-medium text-accent">
          {badge}
        </span>
      )}
    </button>
  );
}
