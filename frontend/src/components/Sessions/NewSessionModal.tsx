import { useEffect, useState } from "react";
import { X, Loader } from "lucide-react";
import { api } from "../../lib/api";
import type { ProjectInfo, SessionInfo } from "../../types";

interface NewSessionModalProps {
  onClose: () => void;
  onSessionCreated: (session: SessionInfo) => void;
}

export default function NewSessionModal({
  onClose,
  onSessionCreated,
}: NewSessionModalProps) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [featureDescription, setFeatureDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await api.listProjects();
        setProjects(data);
        if (data.length > 0) {
          setSelectedProjectId(data[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load projects");
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, []);

  const handleCreate = async () => {
    if (!selectedProjectId) {
      setError("Please select a project");
      return;
    }

    const project = projects.find((p) => p.id === selectedProjectId);
    if (!project) {
      setError("Project not found");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const session = await api.createSession({
        project_id: selectedProjectId,
        name: sessionName || `${project.name}-session`,
        feature_description: featureDescription || undefined,
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
        ) : projects.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">No projects yet</p>
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium transition hover:bg-gray-800"
            >
              Create a Project First
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Project
              </label>
              <select
                value={selectedProjectId || ""}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-accent focus:outline-none"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              {projects.find((p) => p.id === selectedProjectId)?.description && (
                <p className="mt-2 text-xs text-gray-400">
                  {projects.find((p) => p.id === selectedProjectId)?.description}
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

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Feature Request (optional)
              </label>
              <textarea
                value={featureDescription}
                onChange={(e) => setFeatureDescription(e.target.value)}
                placeholder="Describe what you want to build... (e.g., Add dark mode toggle)"
                rows={3}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-accent focus:outline-none resize-none"
              />
              {featureDescription && (
                <p className="mt-2 text-xs text-accent/80">
                  Will auto-trigger /new workflow when session starts
                </p>
              )}
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
                disabled={!selectedProjectId || isCreating}
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
