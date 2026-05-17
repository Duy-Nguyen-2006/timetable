"use client";

import { useState } from "react";
import { Key, Eye, EyeOff, Zap } from "lucide-react";
import { useApiKeyStore } from "./api-key-store";

export function ApiKeyScreen() {
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setApiKey = useApiKeyStore((s) => s.setApiKey);

  const handleActivate = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError("Vui lòng nhập API key");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/timetable/verify-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const data = await res.json();

      if (data.valid) {
        setApiKey(trimmed);
      } else {
        setError(data.error || "API key không hợp lệ");
      }
    } catch {
      // If the endpoint doesn't exist yet, just store the key
      setApiKey(trimmed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#141414] border border-white/[0.06] mb-2">
            <Zap className="w-8 h-8 text-[#4DB848]" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Tack<span className="text-[#4DB848]">.</span>
          </h1>
          <p className="text-white/40 text-sm">
            Trình tạo thời khóa biểu thông minh bằng AI
          </p>
        </div>

        {/* API Key Form */}
        <div className="bg-[#141414] border border-white/[0.06] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-[#1a1a1a] border border-white/[0.06] flex items-center justify-center">
              <Key className="w-4 h-4 text-[#4DB848]" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-white">Kích hoạt</h2>
              <p className="text-xs text-white/40">Nhập API key để bắt đầu</p>
            </div>
          </div>

          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleActivate()}
              placeholder="sk-..."
              className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2.5 pr-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#4DB848]/50 focus:ring-1 focus:ring-[#4DB848]/30 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              {showKey ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}

          <button
            onClick={handleActivate}
            disabled={loading || !key.trim()}
            className="w-full px-5 py-2.5 bg-[#4DB848] hover:bg-[#3da33d] text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#4DB848] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Đang kích hoạt...
              </>
            ) : (
              "Kích hoạt"
            )}
          </button>
        </div>

        <p className="text-center text-white/20 text-xs">
          API key được lưu trữ cục bộ trên thiết bị của bạn
        </p>
      </div>
    </div>
  );
}
