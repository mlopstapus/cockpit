import { useState } from "react";
import { X, Folder, ChevronUp, GitBranch, ChevronRight, Zap } from "lucide-react";
import { api } from "../../lib/api";
import type { ProjectInfo } from "../../types";

const PROJECT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

interface BrowseResult {
  current: string;
  parent: string | null;
  is_git_repo: boolean;
  directories: Array<{ name: string; path: string; is_git_repo: boolean }>;
}

interface WorkspaceInfo {
  name: string;
  path: string;
  is_git_repo: boolean;
  default_branch: string | null;
  has_docker_compose: boolean;
}

interface NewProjectModalProps {
  onClose: () => void;
  onProjectCreated: (project: ProjectInfo) => void;
}

export default function NewProjectModal({
  onClose,
  onProjectCreated,
}: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[5]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Folder browser state
  const [showBrowser, setShowBrowser] = useState(false);
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  // Workspace discovery state
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);

  const browse = async (path?: string) => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const data = await api.browseDirectories(path);
      setBrowseData(data);
    } catch (err) {
      setBrowseError(
        err instanceof Error ? err.message : "Failed to browse"
      );
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleOpenBrowser = () => {
    setShowBrowser(true);
    setShowWorkspaces(false);
    browse(); // Uses backend default (browse_root, typically /repos)
  };

  const handleDiscoverWorkspaces = async () => {
    setShowWorkspaces(true);
    setShowBrowser(false);
    setWorkspacesLoading(true);
    setWorkspacesError(null);

    try {
      const discovered = await api.discoverWorkspaces();
      setWorkspaces(discovered);
    } catch (err) {
      setWorkspacesError(
        err instanceof Error ? err.message : "Failed to discover workspaces"
      );
    } finally {
      setWorkspacesLoading(false);
    }
  };

  const handleSelectFolder = (path: string) => {
    setSelectedPath(path);
    setShowBrowser(false);
    // Auto-fill name from folder name if empty
    if (!name.trim()) {
      const folderName = path.split("/").pop() || "";
      setName(folderName);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !selectedPath) return;

    setIsCreating(true);
    setError(null);

    try {
      const project = await api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        repo_path: selectedPath,
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
      <div className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-[#111111] border border-gray-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
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

          {/* Folder selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Folder
            </label>
            {selectedPath ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenBrowser}
                  className="flex-1 flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-left hover:border-gray-600 transition-colors"
                >
                  <Folder size={16} className="text-accent flex-shrink-0" />
                  <span className="truncate text-gray-200">{selectedPath}</span>
                </button>
                <button
                  onClick={() => { setSelectedPath(""); setName(""); }}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleDiscoverWorkspaces}
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-accent/40 bg-accent/5 px-3 py-3 text-sm text-accent hover:border-accent/60 hover:bg-accent/10 transition-colors"
                >
                  <Zap size={16} />
                  Discover Git Repositories
                </button>
                <button
                  onClick={handleOpenBrowser}
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-gray-600 bg-gray-800/50 px-3 py-2.5 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Folder size={15} />
                  Browse manually...
                </button>
              </div>
            )}
          </div>

          {/* Quick workspace discovery */}
          {showWorkspaces && (
            <div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
              <div className="border-b border-gray-700 px-3 py-2 bg-gray-800/50">
                <span className="text-xs text-gray-400 font-medium">
                  Discovered Git Repositories
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {workspacesLoading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                    Discovering workspaces...
                  </div>
                ) : workspacesError ? (
                  <div className="px-3 py-4 text-sm text-red-400">
                    {workspacesError}
                  </div>
                ) : workspaces.length === 0 ? (
                  <div className="px-3 py-6 text-sm text-gray-500 text-center">
                    No git repositories found in workspace directory
                  </div>
                ) : (
                  workspaces.map((ws) => (
                    <button
                      key={ws.path}
                      onClick={() => handleSelectFolder(ws.path)}
                      className="flex w-full items-start gap-3 px-3 py-3 text-sm hover:bg-gray-800 transition-colors border-b border-gray-800/50 last:border-0"
                    >
                      <GitBranch size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-gray-200 font-medium truncate">{ws.name}</p>
                        <p className="text-xs text-gray-500 truncate font-mono">{ws.path}</p>
                        {ws.default_branch && (
                          <p className="text-xs text-gray-600 mt-1">
                            Branch: {ws.default_branch}
                            {ws.has_docker_compose && " • Docker Compose"}
                          </p>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-gray-600 flex-shrink-0 mt-0.5" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Inline folder browser */}
          {showBrowser && (
            <div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
              {/* Current path header */}
              {browseData && (
                <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2 bg-gray-800/50">
                  {browseData.parent && (
                    <button
                      onClick={() => browse(browseData.parent!)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                      title="Go up"
                    >
                      <ChevronUp size={16} />
                    </button>
                  )}
                  <span className="text-xs text-gray-400 truncate flex-1 font-mono">
                    {browseData.current}
                  </span>
                  {browseData.is_git_repo && (
                    <GitBranch size={14} className="text-green-400 flex-shrink-0" />
                  )}
                  <button
                    onClick={() => handleSelectFolder(browseData.current)}
                    className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-600 flex-shrink-0"
                  >
                    Select
                  </button>
                </div>
              )}

              {/* Directory listing */}
              <div className="max-h-48 overflow-y-auto">
                {browseLoading ? (
                  <div className="flex items-center justify-center py-6 text-sm text-gray-500">
                    Loading...
                  </div>
                ) : browseError ? (
                  <div className="px-3 py-4 text-sm text-red-400">
                    {browseError}
                  </div>
                ) : browseData?.directories.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-gray-500 text-center">
                    No subdirectories
                  </div>
                ) : (
                  browseData?.directories.map((dir) => (
                    <button
                      key={dir.path}
                      onClick={() => browse(dir.path)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors border-b border-gray-800/50 last:border-0"
                    >
                      <Folder
                        size={15}
                        className={
                          dir.is_git_repo ? "text-green-400" : "text-gray-500"
                        }
                      />
                      <span className="truncate flex-1 text-left">
                        {dir.name}
                      </span>
                      {dir.is_git_repo && (
                        <span className="text-xs text-green-400/70">git</span>
                      )}
                      <ChevronRight size={14} className="text-gray-600" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

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
          disabled={!name.trim() || !selectedPath || isCreating}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? "Creating..." : "Create Project"}
        </button>
      </div>
    </div>
  );
}
