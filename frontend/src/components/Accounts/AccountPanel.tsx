import { AlertCircle, RotateCcw, Lock } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { api } from "../../lib/api";
import UsageMeter from "./UsageMeter";
import AccountAuthModal from "./AccountAuthModal";
import { useState } from "react";

export default function AccountPanel() {
  const accounts = useCockpit((s) => s.accounts);
  const setAccounts = useCockpit((s) => s.setAccounts);
  const [resetting, setResetting] = useState<string | null>(null);
  const [authingAccount, setAuthingAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResetLimit = async (accountId: string) => {
    setResetting(accountId);
    setError(null);

    try {
      await api.resetAccountLimit(accountId);
      // Refresh accounts
      const updated = await api.listAccounts();
      setAccounts(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to reset limit"
      );
    } finally {
      setResetting(null);
    }
  };

  const handleAuthSuccess = async () => {
    // Refresh accounts to update auth status
    const updated = await api.listAccounts();
    setAccounts(updated);
    setAuthingAccount(null);
  };

  if (accounts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">No accounts configured</p>
      </div>
    );
  }

  const authingAcctData = authingAccount ? accounts.find((a) => a.id === authingAccount) : null;

  return (
    <div className="space-y-4 p-4">
      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-200 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="rounded-lg border border-gray-800 bg-gray-900 p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold text-sm">{account.name}</h3>
                <p className="text-xs text-gray-400">{account.tier}</p>
              </div>
              <div className="flex items-center gap-2">
                {account.auth_status === "needs_auth" && (
                  <div className="rounded bg-red-950 px-2 py-1 text-xs font-semibold text-red-200 flex items-center gap-1">
                    <Lock size={12} />
                    Auth Needed
                  </div>
                )}
                {account.is_rate_limited && (
                  <div className="rounded bg-orange-950 px-2 py-1 text-xs font-semibold text-orange-200">
                    Rate Limited
                  </div>
                )}
              </div>
            </div>

            <UsageMeter account={account} />

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
              <div>
                <span className="block text-gray-500">Today</span>
                {account.messages_today} messages
              </div>
              <div>
                <span className="block text-gray-500">Daily Estimate</span>
                {account.daily_estimate}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              {account.auth_status === "needs_auth" ? (
                <button
                  onClick={() => setAuthingAccount(account.id)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-base transition hover:bg-blue-600"
                >
                  <Lock size={14} />
                  Authenticate
                </button>
              ) : (
                <button
                  onClick={() => handleResetLimit(account.id)}
                  disabled={resetting === account.id}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm font-medium transition hover:bg-gray-800 disabled:opacity-50"
                >
                  {resetting === account.id ? (
                    <>
                      <RotateCcw size={14} className="animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={14} />
                      Reset Limit
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Auth Modal */}
      {authingAccount && authingAcctData && (
        <AccountAuthModal
          account={authingAcctData}
          onClose={() => setAuthingAccount(null)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
}
