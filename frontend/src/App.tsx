import { useEffect, useState } from "react";
import { useCockpit } from "./lib/store";
import { api } from "./lib/api";
import AppShell from "./components/Layout/AppShell";
import SessionDashboard from "./components/Sessions/SessionDashboard";
import ChatView from "./components/Chat/ChatView";
import AccountPanel from "./components/Accounts/AccountPanel";
import SettingsView from "./components/Settings/SettingsView";
import InstallPrompt from "./components/PWA/InstallPrompt";
import { useInstallPrompt } from "./hooks/useInstallPrompt";

export default function App() {
  const activeTab = useCockpit((s) => s.activeTab);
  const setIsLoading = useCockpit((s) => s.setIsLoading);
  const setSessions = useCockpit((s) => s.setSessions);
  const setAccounts = useCockpit((s) => s.setAccounts);
  const setError = useCockpit((s) => s.setError);

  const { canInstall, isInstalled, prompt, dismissPrompt } = useInstallPrompt();
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  // Show install prompt after a short delay on first visit (if not installed)
  useEffect(() => {
    if (!canInstall || isInstalled) {
      return;
    }

    const timer = setTimeout(() => {
      // Check if user has dismissed before
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

  // Initial load: fetch sessions and accounts
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

    // Periodically refresh sessions and accounts
    const interval = setInterval(loadInitialData, 5000);
    return () => clearInterval(interval);
  }, [setIsLoading, setSessions, setAccounts, setError]);

  return (
    <AppShell>
      {showInstallPrompt && (
        <div className="px-4 pt-4">
          <InstallPrompt onInstall={handleInstall} onDismiss={handleDismiss} />
        </div>
      )}
      {activeTab === "sessions" && <SessionDashboard />}
      {activeTab === "chat" && <ChatView />}
      {activeTab === "accounts" && <AccountPanel />}
      {activeTab === "settings" && <SettingsView />}
    </AppShell>
  );
}
