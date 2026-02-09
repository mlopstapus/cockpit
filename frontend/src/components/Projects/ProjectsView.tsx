import { useState } from "react";
import { Plus, FolderOpen } from "lucide-react";
import { useCockpit } from "../../lib/store";
import NewProjectModal from "./NewProjectModal";

const PROJECT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

export default function ProjectsView() {
  const projects = useCockpit((s) => s.projects);
  const setProjects = useCockpit((s) => s.setProjects);
  const selectedProjectId = useCockpit((s) => s.selectedProjectId);
  const [showNewModal, setShowNewModal] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  if (selectedProject) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center text-lg font-bold text-white"
            style={{
              backgroundColor: selectedProject.color || PROJECT_COLORS[0],
            }}
          >
            {selectedProject.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{selectedProject.name}</h2>
            {selectedProject.description && (
              <p className="text-sm text-gray-400">
                {selectedProject.description}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm text-gray-400">
            Repo: <span className="text-gray-300">{selectedProject.repo_path}</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {selectedProject.session_count} session{selectedProject.session_count !== 1 ? "s" : ""}
          </p>
        </div>

        <p className="text-sm text-gray-500 text-center py-8">
          Project sessions will appear here once the backend is connected.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projects</h2>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-600"
        >
          <Plus size={16} />
          New
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <FolderOpen size={48} className="text-gray-600" />
          <div className="text-center">
            <h3 className="text-base font-semibold text-gray-300">
              No projects yet
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Create a project to organize your sessions by repo.
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600"
          >
            <Plus size={18} />
            Create Project
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() =>
                useCockpit.getState().navigateToProject(project.id)
              }
              className="flex w-full items-center gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4 text-left transition hover:bg-gray-800"
            >
              <div
                className="h-10 w-10 rounded-lg flex-shrink-0 flex items-center justify-center text-lg font-bold text-white"
                style={{
                  backgroundColor: project.color || PROJECT_COLORS[0],
                }}
              >
                {project.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">
                  {project.name}
                </h3>
                {project.description && (
                  <p className="text-xs text-gray-400 truncate">
                    {project.description}
                  </p>
                )}
              </div>
              <span className="text-xs text-gray-500">
                {project.session_count} session{project.session_count !== 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onProjectCreated={(project) => {
            setProjects([project, ...projects]);
            setShowNewModal(false);
          }}
        />
      )}
    </div>
  );
}
