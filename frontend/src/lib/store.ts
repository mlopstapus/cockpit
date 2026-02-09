import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionInfo, AccountInfo, SessionTemplate } from "../types";

export type TabName = "sessions" | "chat" | "accounts" | "settings";

interface CockpitStore {
  // Navigation
  activeTab: TabName;
  setActiveTab: (tab: TabName) => void;

  // Selected session
  selectedSessionId: string | null;
  setSelectedSessionId: (id: string | null) => void;

  // Sessions
  sessions: SessionInfo[];
  setSessions: (sessions: SessionInfo[]) => void;

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
}

export const useCockpit = create<CockpitStore>()(
  persist(
    (set) => ({
      activeTab: "sessions",
      setActiveTab: (tab) => set({ activeTab: tab }),

      selectedSessionId: null,
      setSelectedSessionId: (id) => set({ selectedSessionId: id }),

      sessions: [],
      setSessions: (sessions) => set({ sessions }),

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
    }),
    {
      name: "cockpit-store",
      partialize: (state) => ({
        activeTab: state.activeTab,
        selectedSessionId: state.selectedSessionId,
        templates: state.templates,
      }),
    }
  )
);
