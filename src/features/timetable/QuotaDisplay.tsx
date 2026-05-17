"use client";

import { Settings } from "lucide-react";
import { useApiKeyStore } from "./api-key-store";

interface QuotaDisplayProps {
  onOpenSettings: () => void;
}

export function QuotaDisplay({ onOpenSettings }: QuotaDisplayProps) {
  const apiKey = useApiKeyStore((s) => s.apiKey);

  return (
    <div className="flex items-center gap-2">
      {apiKey && (
        <span className="text-[10px] text-white/30 bg-white/[0.04] px-2 py-1 rounded-md">
          ● Đã kết nối
        </span>
      )}
      <button
        onClick={onOpenSettings}
        className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
        aria-label="Cài đặt"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  );
}
