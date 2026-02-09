import { Trash2, Plus, Copy } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { api } from "../../lib/api";
import { useState } from "react";
import type { SessionTemplate } from "../../types";

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

  const handleUseTemplate = async (template: SessionTemplate) => {
    try {
      const newSession = await api.createSession({
        repo_name: template.repo_name,
        account_id: template.account_id,
        name: `From: ${template.name}`,
      });

      setSessions([...sessions, newSession]);
      setSelectedSessionId(newSession.id);
      setActiveTab("chat");
    } catch (err) {
      console.error("Failed to create session from template:", err);
      alert("Failed to create session");
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Saved Templates</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white transition hover:bg-blue-600"
        >
          <Plus size={14} />
          New
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 space-y-3">
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name (e.g., 'Bug Fix')"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-accent focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-accent focus:outline-none resize-none h-12"
          />
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-accent focus:outline-none"
          >
            <option value="">Select repository...</option>
            {repos.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white focus:border-accent focus:outline-none"
          >
            <option value="">Default account</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.tier})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={handleCreateTemplate}
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-600"
            >
              Create
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium transition hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {templates.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">
            No templates yet. Create one to save your favorite session setups.
          </p>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-gray-700 bg-gray-800 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-semibold text-white">
                    {template.name}
                  </h3>
                  {template.description && (
                    <p className="text-xs text-gray-400 mt-1">
                      {template.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {template.repo_name}
                    {template.account_id && ` • ${template.account_id}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleUseTemplate(template)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white transition"
                    title="Use this template"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => removeTemplate(template.id)}
                    className="rounded p-1 text-gray-400 hover:bg-red-900/20 hover:text-red-400 transition"
                    title="Delete template"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
