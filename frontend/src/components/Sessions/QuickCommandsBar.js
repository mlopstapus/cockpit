import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { GitBranch, Package, TestTube } from "lucide-react";
import { api } from "../../lib/api";
import { useCockpit } from "../../lib/store";
import { useState } from "react";
const QUICK_COMMANDS = [
    {
        id: "git-status",
        label: "Git Status",
        icon: _jsx(GitBranch, { size: 16 }),
        command: "git status",
        description: "Check repository status",
    },
    {
        id: "git-log",
        label: "Recent Commits",
        icon: _jsx(GitBranch, { size: 16 }),
        command: "git log --oneline -10",
        description: "Show last 10 commits",
    },
    {
        id: "docker-ps",
        label: "Docker Status",
        icon: _jsx(Package, { size: 16 }),
        command: "docker ps",
        description: "List running containers",
    },
    {
        id: "docker-logs",
        label: "Docker Logs",
        icon: _jsx(Package, { size: 16 }),
        command: "docker compose logs -f",
        description: "Follow docker-compose logs",
    },
    {
        id: "test",
        label: "Run Tests",
        icon: _jsx(TestTube, { size: 16 }),
        command: "npm test",
        description: "Run test suite",
    },
];
export default function QuickCommandsBar({ repoName }) {
    const setSessions = useCockpit((s) => s.setSessions);
    const setSelectedSessionId = useCockpit((s) => s.setSelectedSessionId);
    const setActiveTab = useCockpit((s) => s.setActiveTab);
    const sessions = useCockpit((s) => s.sessions);
    const [executing, setExecuting] = useState(null);
    const handleQuickCommand = async (command) => {
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
            setSelectedSessionId(newSession.id);
            setActiveTab("chat");
        }
        catch (err) {
            console.error("Failed to execute quick command:", err);
            alert("Failed to execute command");
        }
        finally {
            setExecuting(null);
        }
    };
    return (_jsxs("div", { className: "space-y-2 px-4 py-3", children: [_jsx("p", { className: "text-xs font-medium text-gray-500", children: "Quick Commands" }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: QUICK_COMMANDS.map((cmd) => (_jsxs("button", { onClick: () => handleQuickCommand(cmd), disabled: executing === cmd.id, title: cmd.description, className: "flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs transition hover:bg-gray-700 disabled:opacity-50", children: [_jsx("span", { className: "text-gray-400", children: cmd.icon }), _jsx("span", { children: cmd.label })] }, cmd.id))) })] }));
}
