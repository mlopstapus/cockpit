import { Share2 } from "lucide-react";

export default function InstallInstructions() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (!isIOS) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
      <div className="flex items-start gap-2">
        <Share2 size={16} className="mt-0.5 flex-shrink-0 text-blue-400" />
        <div>
          <p className="text-xs font-medium text-white">
            Install on iPhone
          </p>
          <ol className="mt-1 space-y-1 text-xs text-gray-400">
            <li>1. Tap the Share button <Share2 size={12} className="inline" /></li>
            <li>2. Scroll down and tap "Add to Home Screen"</li>
            <li>3. Tap "Add" to confirm</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
