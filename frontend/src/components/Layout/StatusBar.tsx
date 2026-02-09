import { Wifi, WifiOff, Lock, AlertCircle } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { useEffect, useState } from "react";

export default function StatusBar() {
  const accounts = useCockpit((s) => s.accounts);
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

  const primaryAccount = accounts[0];
  const usagePercent = primaryAccount?.usage_pct || 0;
  const authStatus = primaryAccount?.auth_status;

  return (
    <div className="flex items-center justify-between border-b border-gray-800 bg-base px-4 py-3">
      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi size={16} className="text-green-500" />
        ) : (
          <WifiOff size={16} className="text-red-500" />
        )}
        <span className="text-sm text-gray-400">
          {isOnline ? "Connected" : "Offline"}
        </span>
      </div>

      {primaryAccount && (
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-0">
            <span className="text-xs text-gray-300">{primaryAccount.name}</span>
            <span className="text-xs text-gray-500">
              {Math.round(usagePercent)}%
            </span>
          </div>

          {/* Auth Status Indicator */}
          {authStatus === "needs_auth" ? (
            <div className="h-8 w-8 rounded-full border-2 border-red-500 bg-red-950 flex items-center justify-center">
              <Lock size={14} className="text-red-300" />
            </div>
          ) : authStatus === "authenticating" ? (
            <div className="h-8 w-8 rounded-full border-2 border-yellow-500 bg-yellow-950 flex items-center justify-center animate-pulse">
              <AlertCircle size={14} className="text-yellow-300" />
            </div>
          ) : (
            <div className="h-8 w-8 rounded-full border-2 border-gray-700 bg-gray-900 flex items-center justify-center overflow-hidden">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${usagePercent}%`,
                  fontSize: 0,
                }}
              />
              {/* Show percentage inside circle */}
              <span className="absolute text-xs font-bold text-white">
                {Math.round(usagePercent)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
