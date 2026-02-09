import { Download, X } from "lucide-react";

interface InstallPromptProps {
  onInstall: () => void;
  onDismiss: () => void;
}

export default function InstallPrompt({ onInstall, onDismiss }: InstallPromptProps) {
  return (
    <div className="animate-in slide-in-from-bottom-2 space-y-3 rounded-lg border border-accent/30 bg-gradient-to-r from-blue-500/10 to-blue-600/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-white">Add to Home Screen</h3>
          <p className="text-xs text-gray-400">
            Install Claude Cockpit for quick access from your homescreen
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 transition hover:text-gray-300"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onInstall}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600"
        >
          <Download size={14} />
          Install
        </button>
        <button
          onClick={onDismiss}
          className="flex flex-1 items-center justify-center rounded-lg border border-gray-600 px-3 py-2 text-xs font-medium transition hover:bg-gray-800"
        >
          Maybe Later
        </button>
      </div>

      <p className="text-xs text-gray-500">
        📱 Works offline • 🔒 End-to-end encrypted • ⚡ Fast
      </p>
    </div>
  );
}
