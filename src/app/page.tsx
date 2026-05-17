"use client";

import { useState, useEffect } from "react";
import { Zap, Sparkles, Settings, X, Key, Trash2 } from "lucide-react";
import { useApiKeyStore } from "@/features/timetable/api-key-store";
import { ApiKeyScreen } from "@/features/timetable/ApiKeyScreen";
import { TimetableApp } from "@/features/timetable/TimetableApp";

export default function Home() {
  const { apiKey, isHydrated, hydrateApiKeyFromStorage, clearApiKey, setApiKey } =
    useApiKeyStore();
  const [showApp, setShowApp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsKey, setSettingsKey] = useState("");

  useEffect(() => {
    hydrateApiKeyFromStorage();
  }, [hydrateApiKeyFromStorage]);

  // Wait for hydration
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#4DB848] border-t-transparent animate-spin" />
      </div>
    );
  }

  // If no API key, show activation screen
  if (!apiKey) {
    return <ApiKeyScreen />;
  }

  // If showing the timetable app
  if (showApp) {
    return (
      <TimetableApp
        onOpenSettings={() => setShowSettings(true)}
        onBack={() => setShowApp(false)}
      />
    );
  }

  // Landing page
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full text-center space-y-8">
          {/* Branding */}
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#141414] border border-white/[0.06]">
              <Zap className="w-10 h-10 text-[#4DB848]" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
              Tack<span className="text-[#4DB848]">.</span>
            </h1>
            <p className="text-white/40 text-base sm:text-lg max-w-sm mx-auto">
              Trình tạo thời khóa biểu thông minh bằng AI
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
            <div className="bg-[#141414] border border-white/[0.06] rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-[#1a1a1a] border border-white/[0.06] flex items-center justify-center mb-3">
                <Sparkles className="w-4 h-4 text-[#4DB848]" />
              </div>
              <h3 className="text-white text-sm font-medium mb-1">
                AI phân tích
              </h3>
              <p className="text-white/30 text-xs">
                Phân tích ràng buộc tự động bằng LLM
              </p>
            </div>
            <div className="bg-[#141414] border border-white/[0.06] rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-[#1a1a1a] border border-white/[0.06] flex items-center justify-center mb-3">
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <h3 className="text-white text-sm font-medium mb-1">
                OR-Tools
              </h3>
              <p className="text-white/30 text-xs">
                Giải tối ưu bằng công cụ Google
              </p>
            </div>
            <div className="bg-[#141414] border border-white/[0.06] rounded-xl p-4">
              <div className="w-9 h-9 rounded-lg bg-[#1a1a1a] border border-white/[0.06] flex items-center justify-center mb-3">
                <Settings className="w-4 h-4 text-cyan-400" />
              </div>
              <h3 className="text-white text-sm font-medium mb-1">
                Xác minh
              </h3>
              <p className="text-white/30 text-xs">
                AI kiểm tra và xác minh kết quả
              </p>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => setShowApp(true)}
            className="px-8 py-3.5 bg-[#4DB848] hover:bg-[#3da33d] text-white font-medium rounded-xl text-base transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 mx-auto"
          >
            <Sparkles className="w-5 h-5" />
            Tạo thời khóa biểu
          </button>

          <p className="text-white/20 text-xs">
            Hoàn toàn miễn phí • AI xử lý tự động • Kết quả tức thì
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-4 text-center">
        <p className="text-white/15 text-xs">
          Tack. — Trình tạo thời khóa biểu AI © 2025
        </p>
      </footer>

      {/* Settings Dialog */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#141414] border border-white/[0.06] rounded-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-white text-sm font-medium flex items-center gap-2">
                <Settings className="w-4 h-4 text-white/60" /> Cài đặt
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-white/30 hover:text-white/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-white/40 text-xs mb-2 block flex items-center gap-1.5">
                <Key className="w-3 h-3" /> API Key
              </label>
              <input
                type="password"
                value={settingsKey}
                onChange={(e) => setSettingsKey(e.target.value)}
                placeholder={apiKey ? "••••••••" : "Nhập API key..."}
                className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#4DB848]/50 focus:ring-1 focus:ring-[#4DB848]/30 transition-colors"
              />
            </div>

            <div className="flex gap-2">
              {settingsKey.trim() && (
                <button
                  onClick={() => {
                    setApiKey(settingsKey.trim());
                    setSettingsKey("");
                    setShowSettings(false);
                  }}
                  className="flex-1 px-4 py-2.5 bg-[#4DB848] hover:bg-[#3da33d] text-white font-medium rounded-lg text-sm transition-colors"
                >
                  Cập nhật
                </button>
              )}
              <button
                onClick={() => {
                  clearApiKey();
                  setSettingsKey("");
                  setShowSettings(false);
                  setShowApp(false);
                }}
                className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium rounded-lg text-sm transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xoá key
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-white/70 font-medium rounded-lg text-sm transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
