import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Trash2, Plus, Copy } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { api } from "../../lib/api";
import { useState } from "react";
export default function SessionTemplatesPanel() {
    const templates = useCockpit((s) => s.templates);
    const addTemplate = useCockpit((s) => s.addTemplate);
    const removeTemplate = useCockpit((s) => s.removeTemplate);
    const sessions = useCockpit((s) => s.sessions);
    const setSessions = useCockpit((s) => s.setSessions);
    const setSelectedSessionId = useCockpit((s) => s.setSelectedSessionId);
    const setActiveTab = useCockpit((s) => s.setActiveTab);
    const [showForm, setShowForm] = useState(false);
    const [templateName, setTemplateName] = useState("");
    const [selectedRepo, setSelectedRepo] = useState("");
    const [selectedAccount, setSelectedAccount] = useState("");
    const [description, setDescription] = useState("");
    const repos = [...new Set(sessions.map((s) => s.repo_name))];
    const accounts = useCockpit((s) => s.accounts);
    const handleCreateTemplate = () => {
        if (!templateName || !selectedRepo) {
            alert("Please fill in name and select a repository");
            return;
        }
        const newTemplate = {
            id: `template-${Date.now()}`,
            name: templateName,
            repo_name: selectedRepo,
            account_id: selectedAccount || undefined,
            description: description || undefined,
            color: undefined,
            createdAt: new Date().toISOString(),
        };
        addTemplate(newTemplate);
        setTemplateName("");
        setSelectedRepo("");
        setSelectedAccount("");
        setDescription("");
        setShowForm(false);
    };
    const handleUseTemplate = async (template) => {
        try {
            const newSession = await api.createSession({
                repo_name: template.repo_name,
                account_id: template.account_id,
                name: `From: ${template.name}`,
            });
            setSessions([...sessions, newSession]);
            setSelectedSessionId(newSession.id);
            setActiveTab("chat");
        }
        catch (err) {
            console.error("Failed to create session from template:", err);
            alert("Failed to create session");
        }
    };
    return (_jsxs("div", { className: "space-y-4 p-4", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-sm font-semibold", children: "Saved Templates" }), _jsxs("button", { onClick: () => setShowForm(!showForm), className: "inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white transition hover:bg-blue-600", children: [_jsx(Plus, { size: 14 }), "New"] })] }), showForm && (_jsxs("div", { className: "rounded-lg border border-gray-700 bg-gray-800 p-4 space-y-3", children: [_jsx("input", { type: "text", value: templateName, onChange: (e) => setTemplateName(e.target.value), placeholder: "Template name (e.g., 'Bug Fix')", className: "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-accent focus:outline-none" }), _jsx("textarea", { value: description, onChange: (e) => setDescription(e.target.value), placeholder: "Description (optional)", className: "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-accent focus:outline-none resize-none h-12" }), _jsxs("select", { value: selectedRepo, onChange: (e) => setSelectedRepo(e.target.value), className: "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-accent focus:outline-none", children: [_jsx("option", { value: "", children: "Select repository..." }), repos.map((repo) => (_jsx("option", { value: repo, children: repo }, repo)))] }), _jsxs("select", { value: selectedAccount, onChange: (e) => setSelectedAccount(e.target.value), className: "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-accent focus:outline-none", children: [_jsx("option", { value: "", children: "Default account" }), accounts.map((acc) => (_jsxs("option", { value: acc.id, children: [acc.name, " (", acc.tier, ")"] }, acc.id)))] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: handleCreateTemplate, className: "flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600", children: "Create" }), _jsx("button", { onClick: () => setShowForm(false), className: "flex-1 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium transition hover:bg-gray-700", children: "Cancel" })] })] })), _jsx("div", { className: "space-y-2", children: templates.length === 0 ? (_jsx("p", { className: "text-xs text-gray-500 text-center py-4", children: "No templates yet. Create one to save your favorite session setups." })) : (templates.map((template) => (_jsx("div", { className: "rounded-lg border border-gray-700 bg-gray-800 p-3", children: _jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("h3", { className: "text-xs font-semibold text-white", children: template.name }), template.description && (_jsx("p", { className: "text-xs text-gray-400 mt-1", children: template.description })), _jsxs("p", { className: "text-xs text-gray-500 mt-1", children: [template.repo_name, template.account_id && ` • ${template.account_id}`] })] }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { onClick: () => handleUseTemplate(template), className: "rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white transition", title: "Use this template", children: _jsx(Copy, { size: 14 }) }), _jsx("button", { onClick: () => removeTemplate(template.id), className: "rounded p-1 text-gray-400 hover:bg-red-900/20 hover:text-red-400 transition", title: "Delete template", children: _jsx(Trash2, { size: 14 }) })] })] }) }, template.id)))) })] }));
}
