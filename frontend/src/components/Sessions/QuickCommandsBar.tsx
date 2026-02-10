import { GitBranch, Package, TestTube } from "lucide-react";
import { api } from "../../lib/api";
import { useCockpit } from "../../lib/store";
import { useState } from "react";

interface QuickCommand {
  id: string;
  label: string;
  icon: React.ReactNode;
  command: string;
  description: string;
}

const QUICK_COMMANDS: QuickCommand[] = [
  {
    id: "git-status",
    label: "Git Status",
    icon: <GitBranch size={16} />,
    command: "git status",
    description: "Check repository status",
  },
  {
    id: "git-log",
    label: "Recent Commits",
    icon: <GitBranch size={16} />,
    command: "git log --oneline -10",
    description: "Show last 10 commits",
  },
  {
    id: "docker-ps",
    label: "Docker Status",
    icon: <Package size={16} />,
    command: "docker ps",
    description: "List running containers",
  },
  {
    id: "docker-logs",
    label: "Docker Logs",
    icon: <Package size={16} />,
    command: "docker compose logs -f",
    description: "Follow docker-compose logs",
  },
  {
    id: "test",
    label: "Run Tests",
    icon: <TestTube size={16} />,
    command: "npm test",
    description: "Run test suite",
  },
];

interface QuickCommandsProps {
  repoName?: string;
}

export default function QuickCommandsBar({ repoName }: QuickCommandsProps) {
  const setSessions = useCockpit((s) => s.setSessions);
  const navigateToSession = useCockpit((s) => s.navigateToSession);
  const sessions = useCockpit((s) => s.sessions);

  const [executing, setExecuting] = useState<string | null>(null);

  const handleQuickCommand = async (command: QuickCommand) => {
    try {
      setExecuting(command.id);

      // Get the current repo or use the provided one
      const repo = repoName || sessions[0]?.repo_name;
      if (!repo) {
        alert("No repository selected");
        return;
      }

      // Create a new session with the quick command
      const newSession = await api.createSession({
        repo_name: repo,
        name: `Quick: ${command.label}`,
      });

      // Send the command to the newly created session
      await api.sendMessage(newSession.id, command.command);

      setSessions([...sessions, newSession]);
      navigateToSession(newSession.id);
    } catch (err) {
      console.error("Failed to execute quick command:", err);
      alert("Failed to execute command");
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div className="space-y-2 px-4 py-3">
      <p className="text-xs font-medium text-gray-500">Quick Commands</p>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd.id}
            onClick={() => handleQuickCommand(cmd)}
            disabled={executing === cmd.id}
            title={cmd.description}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs transition hover:bg-gray-700 disabled:opacity-50"
          >
            <span className="text-gray-400">{cmd.icon}</span>
            <span>{cmd.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
