import { ReactNode } from "react";
import BottomNav from "./BottomNav";
import StatusBar from "./StatusBar";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col bg-base text-white">
      {/* Status bar with account info */}
      <StatusBar />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom navigation - iOS style */}
      <BottomNav />
    </div>
  );
}
