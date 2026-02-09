import type { AccountInfo } from "../../types";

interface UsageMeterProps {
  account: AccountInfo;
}

export default function UsageMeter({ account }: UsageMeterProps) {
  const percentage = Math.min(account.usage_pct, 100);
  const getColor = (pct: number) => {
    if (pct < 50) return "bg-green-500";
    if (pct < 80) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">Usage</span>
        <span className="font-semibold text-gray-200">
          {Math.round(percentage)}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${getColor(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
