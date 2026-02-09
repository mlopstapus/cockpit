import { useState, useRef } from "react";
import { Send, Loader } from "lucide-react";
import { api } from "../../lib/api";

interface InputBarProps {
  sessionId: string;
  isConnected: boolean;
}

export default function InputBar({ sessionId, isConnected }: InputBarProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (!message.trim() || !isConnected || isSending) return;

    const content = message.trim();
    setMessage("");
    setIsSending(true);

    try {
      // Send via REST only — WebSocket handles output streaming
      await api.sendMessage(sessionId, content);
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessage(content);
    } finally {
      setIsSending(false);
    }

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  };

  return (
    <div className="border-t border-gray-800 bg-base p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask Claude something..."
          disabled={!isConnected || isSending}
          className="flex-1 resize-none rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-2.5 text-sm placeholder-gray-500 focus:border-accent focus:outline-none disabled:opacity-50"
          rows={1}
          maxLength={2000}
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || !isConnected || isSending}
          className="flex-shrink-0 rounded-xl bg-accent p-2.5 text-white transition hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          {isSending ? (
            <Loader size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>
    </div>
  );
}
