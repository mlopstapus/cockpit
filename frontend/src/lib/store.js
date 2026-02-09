import { create } from "zustand";
import { persist } from "zustand/middleware";
export const useCockpit = create()(persist((set) => ({
    activeTab: "sessions",
    setActiveTab: (tab) => set({ activeTab: tab }),
    selectedSessionId: null,
    setSelectedSessionId: (id) => set({ selectedSessionId: id }),
    sessions: [],
    setSessions: (sessions) => set({ sessions }),
    accounts: [],
    setAccounts: (accounts) => set({ accounts }),
    templates: [],
    addTemplate: (template) => set((state) => ({ templates: [template, ...state.templates] })),
    removeTemplate: (id) => set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
    })),
    setTemplates: (templates) => set({ templates }),
    isLoading: false,
    setIsLoading: (loading) => set({ isLoading: loading }),
    error: null,
    setError: (error) => set({ error }),
}), {
    name: "cockpit-store",
    partialize: (state) => ({
        activeTab: state.activeTab,
        selectedSessionId: state.selectedSessionId,
        templates: state.templates,
    }),
}));
