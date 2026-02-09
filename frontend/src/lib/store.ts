import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionInfo, AccountInfo, SessionTemplate, ProjectInfo } from "../types";

export type ViewName = "sessions" | "chat" | "accounts" | "settings" | "projects";

interface CockpitStore {
  // Navigation
  currentView: ViewName;
  setCurrentView: (view: ViewName) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Selected entities
  selectedSessionId: string | null;
  setSelectedSessionId: (id: string | null) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;

  // Sessions
  sessions: SessionInfo[];
  setSessions: (sessions: SessionInfo[]) => void;

  // Projects
  projects: ProjectInfo[];
  setProjects: (projects: ProjectInfo[]) => void;

  // Accounts
  accounts: AccountInfo[];
  setAccounts: (accounts: AccountInfo[]) => void;

  // Session Templates
  templates: SessionTemplate[];
  addTemplate: (template: SessionTemplate) => void;
  removeTemplate: (id: string) => void;
  setTemplates: (templates: SessionTemplate[]) => void;

  // UI state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  error: string | null;
  setError: (error: string | null) => void;

  // Helpers
  navigateToSession: (sessionId: string) => void;
  navigateToProject: (projectId: string) => void;
}

export const useCockpit = create<CockpitStore>()(
  persist(
    (set) => ({
      currentView: "sessions",
      setCurrentView: (view) => set({ currentView: view, sidebarOpen: false }),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      selectedSessionId: null,
      setSelectedSessionId: (id) => set({ selectedSessionId: id }),
      selectedProjectId: null,
      setSelectedProjectId: (id) => set({ selectedProjectId: id }),

      sessions: [],
      setSessions: (sessions) => set({ sessions }),

      projects: [],
      setProjects: (projects) => set({ projects }),

      accounts: [],
      setAccounts: (accounts) => set({ accounts }),

      templates: [],
      addTemplate: (template) =>
        set((state) => ({ templates: [template, ...state.templates] })),
      removeTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        })),
      setTemplates: (templates) => set({ templates }),

      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),

      error: null,
      setError: (error) => set({ error }),

      navigateToSession: (sessionId) =>
        set({ selectedSessionId: sessionId, currentView: "chat", sidebarOpen: false }),
      navigateToProject: (projectId) =>
        set({ selectedProjectId: projectId, currentView: "projects", sidebarOpen: false }),
    }),
    {
      name: "cockpit-store",
      partialize: (state) => ({
        currentView: state.currentView,
        selectedSessionId: state.selectedSessionId,
        selectedProjectId: state.selectedProjectId,
        templates: state.templates,
      }),
    }
  )
);
