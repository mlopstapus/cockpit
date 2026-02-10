import { useEffect, useRef } from "react";
import { ChevronLeft, Loader } from "lucide-react";
import { useCockpit } from "../../lib/store";
import { useSessionWebSocket } from "../../hooks/useWebSocket";
import { useNotifications } from "../../hooks/useNotifications";
import { ANSIRenderer } from "./ANSIRenderer";
import InputBar from "./InputBar";
import MessageBubble from "./MessageBubble";

export default function ChatView() {
  const selectedSessionId = useCockpit((s) => s.selectedSessionId);
  const sessions = useCockpit((s) => s.sessions);
  const setCurrentView = useCockpit((s) => s.setCurrentView);
  const setSelectedSessionId = useCockpit((s) => s.setSelectedSessionId);

  const { messages, outputBuffer, isConnected } =
    useSessionWebSocket(selectedSessionId);

  const { sendNotification, hasPermission } = useNotifications();
  const lastNotifiedRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, outputBuffer]);

  // Send notification on task completion
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage &&
      lastMessage.type === "task_complete" &&
      lastNotifiedRef.current !== lastMessage.timestamp &&
      hasPermission
    ) {
      lastNotifiedRef.current = lastMessage.timestamp;
      const body = typeof lastMessage.data?.summary === "string"
        ? lastMessage.data.summary
        : "Claude has finished processing your request";
      sendNotification({
        title: "Task Complete",
        body,
        icon: "/icon-192.png",
        tag: "task-complete",
      });
    }
  }, [messages, hasPermission, sendNotification]);

  const session = sessions.find((s) => s.id === selectedSessionId);

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Session not found</p>
      </div>
    );
  }

  const handleBack = () => {
    setSelectedSessionId(null);
    setCurrentView("sessions");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-sm font-semibold">{session.name}</h1>
            <p className="text-xs text-gray-400">{session.repo_name}</p>
          </div>
          <div className="flex items-center gap-1">
            {isConnected ? (
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-gray-400">Live</span>
              </div>
            ) : (
              <span className="text-xs text-gray-500">Offline</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 && !outputBuffer ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <Loader size={24} className="animate-spin text-accent" />
            <p className="text-sm text-gray-400">Waiting for Claude...</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble
                key={`${msg.timestamp}-${msg.type}`}
                message={msg}
              />
            ))}

            {/* Current streaming output */}
            {outputBuffer && (
              <div className="rounded-lg bg-gray-800 p-3 text-sm text-gray-100">
                <p className="text-xs font-mono text-gray-500 mb-2">OUTPUT</p>
                <pre className="font-mono whitespace-pre-wrap break-words text-xs leading-relaxed">
                  <ANSIRenderer text={outputBuffer} />
                </pre>
              </div>
            )}

            {isConnected && outputBuffer && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                Claude is thinking...
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      {selectedSessionId && (
        <InputBar
          sessionId={selectedSessionId}
          isConnected={isConnected}
        />
      )}
    </div>
  );
}
