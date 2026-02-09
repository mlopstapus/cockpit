import { RotateCcw, Info, Github, CheckCircle } from "lucide-react";
import { useState } from "react";
import InstallInstructions from "../PWA/InstallInstructions";
import NotificationToggle from "../PWA/NotificationToggle";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";

export default function SettingsView() {
  const [clearedCache, setClearedCache] = useState(false);
  const { isInstalled, canInstall } = useInstallPrompt();

  const handleClearCache = () => {
    // Clear localStorage
    localStorage.clear();
    // Clear service worker cache
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          caches.delete(name);
        });
      });
    }
    setClearedCache(true);
    setTimeout(() => setClearedCache(false), 2000);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Device Info */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 text-sm font-semibold">Device</h3>
        <div className="space-y-2 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>User Agent</span>
            <span className="text-gray-300 text-right break-words flex-1 ml-2">
              {navigator.userAgent}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Online Status</span>
            <span className={navigator.onLine ? "text-green-400" : "text-red-400"}>
              {navigator.onLine ? "Online" : "Offline"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Storage</span>
            <span className="text-gray-300">Available</span>
          </div>
        </div>
      </div>

      {/* PWA Info */}
      {isInstalled ? (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-white">Installed</h3>
              <p className="text-xs text-gray-400 mt-1">
                Running as standalone app. Works offline! 📱
              </p>
            </div>
          </div>
        </div>
      ) : canInstall ? (
        <>
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
            <h3 className="mb-3 text-sm font-semibold">Get App Experience</h3>
            <p className="text-xs text-gray-400 mb-3">
              Install to homescreen for faster access and offline capability.
            </p>
            <button className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600">
              Install App
            </button>
          </div>
          <InstallInstructions />
        </>
      ) : null}

      {/* Notifications */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="mb-3 text-sm font-semibold">Notifications</h3>
        <NotificationToggle />
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={handleClearCache}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium transition hover:bg-gray-800"
        >
          <RotateCcw size={16} />
          {clearedCache ? "Cache cleared" : "Clear cache"}
        </button>
      </div>

      {/* About */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-start gap-3">
          <Info size={18} className="flex-shrink-0 mt-0.5 text-accent" />
          <div className="text-xs text-gray-400 space-y-2">
            <p>
              <strong>Claude Cockpit v0.1.0</strong>
            </p>
            <p>
              Manage your Claude Code agent sessions from your phone, running on your NUC over Tailscale.
            </p>
            <a
              href="https://github.com/anthropics/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              <Github size={14} />
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
