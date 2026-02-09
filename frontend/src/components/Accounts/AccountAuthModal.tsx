import { X, Loader } from "lucide-react";
import { useState, useCallback } from "react";
import { api } from "../../lib/api";
import type { AccountInfo } from "../../types";
import AuthTerminal from "./AuthTerminal";

interface AccountAuthModalProps {
  account: AccountInfo;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AccountAuthModal({
  account,
  onClose,
  onSuccess,
}: AccountAuthModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await api.startAuthentication(account.id);
      setIsAuthenticating(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start authentication");
      setIsLoading(false);
    }
  }, [account.id]);

  const handleAuthSuccess = useCallback(async () => {
    try {
      await api.confirmAuth(account.id);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm authentication");
    }
  }, [account.id, onSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{account.name}</h2>
            <p className="text-xs text-gray-400">{account.tier}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {!isAuthenticating ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-sm text-gray-300">
                This account needs re-authentication. Follow the interactive prompts to sign in
                with your Claude account.
              </p>
            </div>

            <button
              onClick={handleStartAuth}
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base transition hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading && <Loader size={16} className="animate-spin" />}
              Start Authentication
            </button>
          </div>
        ) : (
          <AuthTerminal
            accountId={account.id}
            onSuccess={handleAuthSuccess}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  );
}
