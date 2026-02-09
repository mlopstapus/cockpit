import {
  MessageSquare,
  Home,
  Settings,
  Users,
} from "lucide-react";
import { useCockpit } from "../../lib/store";
import type { TabName } from "../../lib/store";

const tabs: Array<{
  name: TabName;
  label: string;
  icon: typeof Home;
}> = [
  { name: "sessions", label: "Sessions", icon: Home },
  { name: "chat", label: "Chat", icon: MessageSquare },
  { name: "accounts", label: "Accounts", icon: Users },
  { name: "settings", label: "Settings", icon: Settings },
];

export default function BottomNav() {
  const activeTab = useCockpit((s) => s.activeTab);
  const setActiveTab = useCockpit((s) => s.setActiveTab);

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-gray-800 bg-base">
      <div className="flex items-center justify-around px-0 py-3 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ name, label, icon: Icon }) => (
          <button
            key={name}
            onClick={() => setActiveTab(name)}
            className={`flex flex-col items-center justify-center gap-1 px-4 py-2 transition-colors ${
              activeTab === name ? "text-accent" : "text-gray-400"
            }`}
            aria-label={label}
          >
            <Icon size={24} />
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
