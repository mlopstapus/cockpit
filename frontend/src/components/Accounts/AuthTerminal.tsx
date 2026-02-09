import { useEffect, useRef, useState } from "react";
import { Loader } from "lucide-react";
import { createAuthSocket } from "../../lib/api";
import { ANSIRenderer } from "../Chat/ANSIRenderer";

interface AuthTerminalProps {
  accountId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AuthTerminal({
  accountId,
  onSuccess,
  onCancel,
}: AuthTerminalProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [output, setOutput] = useState<string>("");
  const [inputValue, setInputValue] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = createAuthSocket(accountId);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "output") {
          setOutput((prev) => prev + (data.content || ""));
        } else if (data.type === "status") {
          if (data.status === "authenticated") {
            setIsDone(true);
            setTimeout(onSuccess, 1000);
          }
        } else if (data.type === "error") {
          setError(data.message || "Authentication error");
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [accountId, onSuccess]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const handleSendInput = () => {
    if (inputValue.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "input",
          content: inputValue,
        })
      );
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendInput();
    }
  };

  return (
    <div className="space-y-3">
      {/* Terminal Output */}
      <div
        ref={scrollRef}
        className="h-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-xs text-gray-200"
      >
        {output ? (
          <ANSIRenderer text={output} className="whitespace-pre-wrap break-words" />
        ) : (
          <p className="text-gray-500">Connecting to authentication service...</p>
        )}
        {isDone && (
          <div className="mt-2 text-green-400">
            ✅ Authentication successful!
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950 p-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Input */}
      {!isDone && isConnected && (
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your response..."
            disabled={!isConnected}
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSendInput}
            disabled={!inputValue.trim() || !isConnected}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-base transition hover:bg-blue-600 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}

      {isDone && (
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-700 px-3 py-2 text-xs font-medium transition hover:bg-gray-800"
          >
            Close
          </button>
          <button
            onClick={onSuccess}
            className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-700"
          >
            Done
          </button>
        </div>
      )}

      {!isConnected && !isDone && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 py-3 text-xs text-gray-400">
          <Loader size={14} className="animate-spin" />
          Connecting...
        </div>
      )}
    </div>
  );
}
