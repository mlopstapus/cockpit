import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { AlertCircle, RotateCcw, Lock } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { api } from "../../lib/api";
import UsageMeter from "./UsageMeter";
import AccountAuthModal from "./AccountAuthModal";
import { useState } from "react";
export default function AccountPanel() {
    const accounts = useCockpit((s) => s.accounts);
    const setAccounts = useCockpit((s) => s.setAccounts);
    const [resetting, setResetting] = useState(null);
    const [authingAccount, setAuthingAccount] = useState(null);
    const [error, setError] = useState(null);
    const handleResetLimit = async (accountId) => {
        setResetting(accountId);
        setError(null);
        try {
            await api.resetAccountLimit(accountId);
            // Refresh accounts
            const updated = await api.listAccounts();
            setAccounts(updated);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to reset limit");
        }
        finally {
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
        return (_jsx("div", { className: "flex items-center justify-center h-full", children: _jsx("p", { className: "text-gray-400", children: "No accounts configured" }) }));
    }
    const authingAcctData = authingAccount ? accounts.find((a) => a.id === authingAccount) : null;
    return (_jsxs("div", { className: "space-y-4 p-4", children: [error && (_jsxs("div", { className: "rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-200 flex items-start gap-2", children: [_jsx(AlertCircle, { size: 16, className: "flex-shrink-0 mt-0.5" }), _jsx("p", { children: error })] })), _jsx("div", { className: "space-y-3", children: accounts.map((account) => (_jsxs("div", { className: "rounded-lg border border-gray-800 bg-gray-900 p-4", children: [_jsxs("div", { className: "flex items-start justify-between gap-3 mb-3", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-semibold text-sm", children: account.name }), _jsx("p", { className: "text-xs text-gray-400", children: account.tier })] }), _jsxs("div", { className: "flex items-center gap-2", children: [account.auth_status === "needs_auth" && (_jsxs("div", { className: "rounded bg-red-950 px-2 py-1 text-xs font-semibold text-red-200 flex items-center gap-1", children: [_jsx(Lock, { size: 12 }), "Auth Needed"] })), account.is_rate_limited && (_jsx("div", { className: "rounded bg-orange-950 px-2 py-1 text-xs font-semibold text-orange-200", children: "Rate Limited" }))] })] }), _jsx(UsageMeter, { account: account }), _jsxs("div", { className: "mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400", children: [_jsxs("div", { children: [_jsx("span", { className: "block text-gray-500", children: "Today" }), account.messages_today, " messages"] }), _jsxs("div", { children: [_jsx("span", { className: "block text-gray-500", children: "Daily Estimate" }), account.daily_estimate] })] }), _jsx("div", { className: "mt-4 flex gap-2", children: account.auth_status === "needs_auth" ? (_jsxs("button", { onClick: () => setAuthingAccount(account.id), className: "flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-base transition hover:bg-blue-600", children: [_jsx(Lock, { size: 14 }), "Authenticate"] })) : (_jsx("button", { onClick: () => handleResetLimit(account.id), disabled: resetting === account.id, className: "flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm font-medium transition hover:bg-gray-800 disabled:opacity-50", children: resetting === account.id ? (_jsxs(_Fragment, { children: [_jsx(RotateCcw, { size: 14, className: "animate-spin" }), "Resetting..."] })) : (_jsxs(_Fragment, { children: [_jsx(RotateCcw, { size: 14 }), "Reset Limit"] })) })) })] }, account.id))) }), authingAccount && authingAcctData && (_jsx(AccountAuthModal, { account: authingAcctData, onClose: () => setAuthingAccount(null), onSuccess: handleAuthSuccess }))] }));
}
