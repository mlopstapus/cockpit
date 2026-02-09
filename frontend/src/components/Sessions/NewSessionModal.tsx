import { useEffect, useState } from "react";
import { X, Loader } from "lucide-react";
import { api } from "../../lib/api";
import type { RepoInfo, SessionInfo } from "../../types";

interface NewSessionModalProps {
  onClose: () => void;
  onSessionCreated: (session: SessionInfo) => void;
}

export default function NewSessionModal({
  onClose,
  onSessionCreated,
}: NewSessionModalProps) {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRepos = async () => {
      try {
        const data = await api.listRepos();
        setRepos(data);
        if (data.length > 0) {
          setSelectedRepo(data[0].name);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load repos");
      } finally {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50">
      <div className="w-full rounded-t-2xl border-t border-gray-800 bg-gray-900 p-6 animate-in slide-in-from-bottom-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Session</h2>
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

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader size={24} className="animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Repository
              </label>
              <select
                value={selectedRepo || ""}
                onChange={(e) => setSelectedRepo(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-accent focus:outline-none"
              >
                {repos.map((repo) => (
                  <option key={repo.name} value={repo.name}>
                    {repo.name}
                  </option>
                ))}
              </select>
              {repos.find((r) => r.name === selectedRepo)?.description && (
                <p className="mt-2 text-xs text-gray-400">
                  {repos.find((r) => r.name === selectedRepo)?.description}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Session Name (optional)
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g., Morning Standup"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium transition hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!selectedRepo || isCreating}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base transition disabled:opacity-50 hover:bg-blue-600"
              >
                {isCreating && <Loader size={16} className="animate-spin" />}
                Create
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
