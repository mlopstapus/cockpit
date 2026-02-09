/* Claude Cockpit — WebSocket hook for session streaming */
import { useEffect, useRef, useState, useCallback } from "react";
import { createSessionSocket } from "../lib/api";
import type { WSMessage } from "../types";

interface UseWebSocketReturn {
  messages: WSMessage[];
  outputBuffer: string;
  isConnected: boolean;
  sendMessage: (content: string) => void;
  clearOutput: () => void;
}

export function useSessionWebSocket(sessionId: string | null): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const [outputBuffer, setOutputBuffer] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const ws = createSessionSocket(sessionId);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log(`WS connected: session ${sessionId}`);
    };

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data);
      setMessages((prev) => [...prev, msg]);

      // Accumulate output text
      if (msg.type === "output" && typeof msg.data.content === "string") {
        setOutputBuffer((prev) => prev + msg.data.content);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log(`WS disconnected: session ${sessionId}`);
    };

    ws.onerror = (err) => {
      console.error(`WS error: session ${sessionId}`, err);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    (content: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "message", content }));
      }
    },
    []
  );

  const clearOutput = useCallback(() => {
    setOutputBuffer("");
    setMessages([]);
  }, []);

  return { messages, outputBuffer, isConnected, sendMessage, clearOutput };
}
