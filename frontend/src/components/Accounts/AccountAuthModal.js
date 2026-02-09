import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { X, Loader } from "lucide-react";
import { useState, useCallback } from "react";
import { api } from "../../lib/api";
import AuthTerminal from "./AuthTerminal";
export default function AccountAuthModal({ account, onClose, onSuccess, }) {
    const [isLoading, setIsLoading] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [error, setError] = useState(null);
    const handleStartAuth = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await api.startAuthentication(account.id);
            setIsAuthenticating(true);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to start authentication");
            setIsLoading(false);
        }
    }, [account.id]);
    const handleAuthSuccess = useCallback(async () => {
        try {
            await api.confirmAuth(account.id);
            onSuccess();
            onClose();
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to confirm authentication");
        }
    }, [account.id, onSuccess, onClose]);
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4", children: _jsxs("div", { className: "w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold", children: account.name }), _jsx("p", { className: "text-xs text-gray-400", children: account.tier })] }), _jsx("button", { onClick: onClose, className: "rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white", children: _jsx(X, { size: 20 }) })] }), error && (_jsx("div", { className: "mb-4 rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-200", children: error })), !isAuthenticating ? (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "rounded-lg border border-gray-700 bg-gray-800 p-4", children: _jsx("p", { className: "text-sm text-gray-300", children: "This account needs re-authentication. Follow the interactive prompts to sign in with your Claude account." }) }), _jsxs("button", { onClick: handleStartAuth, disabled: isLoading, className: "w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base transition hover:bg-blue-600 disabled:opacity-50", children: [isLoading && _jsx(Loader, { size: 16, className: "animate-spin" }), "Start Authentication"] })] })) : (_jsx(AuthTerminal, { accountId: account.id, onSuccess: handleAuthSuccess, onCancel: onClose }))] }) }));
}
