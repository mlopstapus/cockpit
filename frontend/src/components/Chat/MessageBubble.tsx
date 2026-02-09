import type { WSMessage } from "../../types";
import { ANSIRenderer } from "./ANSIRenderer";

interface MessageBubbleProps {
  message: WSMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isError = message.type === "error";
  const isStatus = message.type === "status";
  const isOutput = message.type === "output";

  if (isStatus) {
    return (
      <div className="flex justify-center">
        <div className="rounded-lg bg-blue-950 px-3 py-1 text-center text-xs text-blue-200">
          {message.data.content as string}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950 p-3">
        <p className="text-xs font-semibold text-red-200">Error</p>
        <p className="mt-1 text-sm text-red-100">
          {message.data.content as string}
        </p>
      </div>
    );
  }

  if (isOutput) {
    return (
      <div className="rounded-lg bg-gray-800 p-3">
        <p className="mb-2 text-xs font-mono text-gray-500">OUTPUT</p>
        <pre className="font-mono text-xs leading-relaxed text-gray-200 whitespace-pre-wrap break-words">
          <ANSIRenderer text={message.data.content as string} />
        </pre>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-gray-800 p-3">
      <p className="text-sm text-gray-200">{message.data.content as string}</p>
      <p className="mt-2 text-xs text-gray-500">
        {new Date(message.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}
