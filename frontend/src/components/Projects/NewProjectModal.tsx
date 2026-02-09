import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { api } from "../../lib/api";
import type { ProjectInfo, RepoInfo } from "../../types";

const PROJECT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

interface NewProjectModalProps {
  onClose: () => void;
  onProjectCreated: (project: ProjectInfo) => void;
}

export default function NewProjectModal({
  onClose,
  onProjectCreated,
}: NewProjectModalProps) {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[5]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listRepos().then(setRepos).catch(console.error);
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !repoPath) return;

    setIsCreating(true);
    setError(null);

    try {
      const project = await api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        repo_path: repoPath,
        color: selectedColor,
      });
      onProjectCreated(project);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create project"
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-[#111111] border border-gray-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Project</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm placeholder-gray-500 focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm placeholder-gray-500 focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Repository
            </label>
            <select
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Select a repo...</option>
              {repos.map((repo) => (
                <option key={repo.name} value={repo.path}>
                  {repo.name} — {repo.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Color</label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`h-8 w-8 rounded-full transition ${
                    selectedColor === color
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#111111]"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={!name.trim() || !repoPath || isCreating}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? "Creating..." : "Create Project"}
        </button>
      </div>
    </div>
  );
}
