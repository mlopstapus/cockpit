import { useEffect, useState } from "react";
import { useCockpit } from "./lib/store";
import { api } from "./lib/api";
import AppShell from "./components/Layout/AppShell";
import SessionDashboard from "./components/Sessions/SessionDashboard";
import ChatView from "./components/Chat/ChatView";
import AccountPanel from "./components/Accounts/AccountPanel";
import SettingsView from "./components/Settings/SettingsView";
import ProjectsView from "./components/Projects/ProjectsView";
import WelcomeScreen from "./components/Chat/WelcomeScreen";
import InstallPrompt from "./components/PWA/InstallPrompt";
import { useInstallPrompt } from "./hooks/useInstallPrompt";

export default function App() {
  const currentView = useCockpit((s) => s.currentView);
  const selectedSessionId = useCockpit((s) => s.selectedSessionId);
  const setIsLoading = useCockpit((s) => s.setIsLoading);
  const setSessions = useCockpit((s) => s.setSessions);
  const setAccounts = useCockpit((s) => s.setAccounts);
  const setProjects = useCockpit((s) => s.setProjects);
  const setError = useCockpit((s) => s.setError);

  const { canInstall, isInstalled, prompt, dismissPrompt } = useInstallPrompt();
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    if (!canInstall || isInstalled) return;

    const timer = setTimeout(() => {
      const hasDismissed = localStorage.getItem("cockpit-install-dismissed");
      if (!hasDismissed) {
        setShowInstallPrompt(true);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [canInstall, isInstalled]);

  const handleInstall = async () => {
    await prompt();
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    localStorage.setItem("cockpit-install-dismissed", "true");
    dismissPrompt();
  };

  // Initial load: fetch sessions, accounts, and projects
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const [sessions, accounts] = await Promise.all([
          api.listSessions(),
          api.listAccounts(),
        ]);
        setSessions(sessions);
        setAccounts(accounts);

        // Projects endpoint may not exist yet — fail gracefully
        try {
          const projects = await api.listProjects();
          setProjects(projects);
        } catch {
          // Projects API not available yet
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load initial data"
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();

    const interval = setInterval(loadInitialData, 5000);
    return () => clearInterval(interval);
  }, [setIsLoading, setSessions, setAccounts, setProjects, setError]);

  const renderView = () => {
    switch (currentView) {
      case "sessions":
        return <SessionDashboard />;
      case "chat":
        return selectedSessionId ? <ChatView /> : <WelcomeScreen />;
      case "accounts":
        return <AccountPanel />;
      case "settings":
        return <SettingsView />;
      case "projects":
        return <ProjectsView />;
      default:
        return <SessionDashboard />;
    }
  };

  return (
    <AppShell>
      {showInstallPrompt && (
        <div className="px-4 pt-4">
          <InstallPrompt onInstall={handleInstall} onDismiss={handleDismiss} />
        </div>
      )}
      {renderView()}
    </AppShell>
  );
}
