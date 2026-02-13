import { Circle, X } from "lucide-react";
import type { SessionInfo } from "../../types";

const statusIndicators: Record<
  SessionInfo["status"],
  { color: string; label: string }
> = {
  starting: { color: "text-yellow-500", label: "Starting" },
  running: { color: "text-green-500", label: "Running" },
  idle: { color: "text-blue-500", label: "Idle" },
  rate_limited: { color: "text-orange-500", label: "Rate Limited" },
  error: { color: "text-red-500", label: "Error" },
  stopped: { color: "text-gray-500", label: "Stopped" },
};

interface SessionCardProps {
  session: SessionInfo;
  onClick: () => void;
  onStop?: (id: string) => void;
}

export default function SessionCard({
  session,
  onClick,
  onStop,
}: SessionCardProps) {
  const status = statusIndicators[session.status];
  const timeSinceUpdate = new Date(session.last_activity);
  const timeAgo = getTimeAgo(timeSinceUpdate);

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-gray-800 bg-gray-900 p-4 transition hover:border-accent hover:bg-gray-800 active:scale-95"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{session.name}</h3>
            <Circle size={8} className={`flex-shrink-0 ${status.color}`} />
          </div>
          <p className="text-xs text-gray-400">{session.project_name}</p>
          <p className="mt-2 text-xs text-gray-500 line-clamp-2">
            {timeAgo}
            {session.message_count > 0 && ` • ${session.message_count} messages`}
          </p>
        </div>

        {onStop && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStop(session.id);
            }}
            className="flex-shrink-0 rounded p-2 text-gray-400 transition hover:bg-gray-800 hover:text-red-500"
            aria-label="Stop session"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
