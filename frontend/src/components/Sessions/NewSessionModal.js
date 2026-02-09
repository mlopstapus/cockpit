import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { X, Loader } from "lucide-react";
import { api } from "../../lib/api";
export default function NewSessionModal({ onClose, onSessionCreated, }) {
    const [repos, setRepos] = useState([]);
    const [selectedRepo, setSelectedRepo] = useState(null);
    const [sessionName, setSessionName] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        const loadRepos = async () => {
            try {
                const data = await api.listRepos();
                setRepos(data);
                if (data.length > 0) {
                    setSelectedRepo(data[0].name);
                }
            }
            catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load repos");
            }
            finally {
                setIsLoading(false);
            }
        };
        loadRepos();
    }, []);
    const handleCreate = async () => {
        if (!selectedRepo) {
            setError("Please select a repository");
            return;
        }
        setIsCreating(true);
        setError(null);
        try {
            const session = await api.createSession({
                repo_name: selectedRepo,
                name: sessionName || selectedRepo,
            });
            onSessionCreated(session);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create session");
            setIsCreating(false);
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-end bg-black/50", children: _jsxs("div", { className: "w-full rounded-t-2xl border-t border-gray-800 bg-gray-900 p-6 animate-in slide-in-from-bottom-4", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold", children: "New Session" }), _jsx("button", { onClick: onClose, className: "rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white", children: _jsx(X, { size: 20 }) })] }), error && (_jsx("div", { className: "mb-4 rounded-lg border border-red-900 bg-red-950 p-3 text-sm text-red-200", children: error })), isLoading ? (_jsx("div", { className: "flex justify-center py-8", children: _jsx(Loader, { size: 24, className: "animate-spin text-accent" }) })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-300 mb-2", children: "Repository" }), _jsx("select", { value: selectedRepo || "", onChange: (e) => setSelectedRepo(e.target.value), className: "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-accent focus:outline-none", children: repos.map((repo) => (_jsx("option", { value: repo.name, children: repo.name }, repo.name))) }), repos.find((r) => r.name === selectedRepo)?.description && (_jsx("p", { className: "mt-2 text-xs text-gray-400", children: repos.find((r) => r.name === selectedRepo)?.description }))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-300 mb-2", children: "Session Name (optional)" }), _jsx("input", { type: "text", value: sessionName, onChange: (e) => setSessionName(e.target.value), placeholder: "e.g., Morning Standup", className: "w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-accent focus:outline-none" })] }), _jsxs("div", { className: "flex gap-3 pt-4", children: [_jsx("button", { onClick: onClose, className: "flex-1 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium transition hover:bg-gray-800", children: "Cancel" }), _jsxs("button", { onClick: handleCreate, disabled: !selectedRepo || isCreating, className: "flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base transition disabled:opacity-50 hover:bg-blue-600", children: [isCreating && _jsx(Loader, { size: 16, className: "animate-spin" }), "Create"] })] })] }))] }) }));
}
