'use client'

import Image from 'next/image'
import { useEffect, useSyncExternalStore, useState } from 'react'
import { Key, LogOut, X, RefreshCw, Loader2 } from 'lucide-react'

import TimetableApp from '@/features/timetable/TimetableApp'
import ApiKeyScreen from '@/features/timetable/ApiKeyScreen'
import QuotaDisplay from '@/features/timetable/QuotaDisplay'
import { useApiKeyStore, formatTokenCount, hydrateApiKeyFromStorage } from '@/features/timetable/ai/api-key-store'
import { panelClass, iconShellClass } from '@/features/timetable/constants'

const emptySubscribe = () => () => {}
function getSnapshot() { return true }
function getServerSnapshot() { return false }

export default function Home() {
  const [showTimetable, setShowTimetable] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Use useSyncExternalStore for safe client-only detection
  const isClient = useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot)

  const { apiKey, clearApiKey, modelPolicy, fetchModelPolicy, isLoadingPolicy } = useApiKeyStore()

  // Hydrate from localStorage on mount
  useEffect(() => {
    hydrateApiKeyFromStorage()
  }, [])

  // Show loading skeleton until client hydrates (prevents flash of ApiKeyScreen)
  if (!isClient) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050505] px-6 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,185,108,0.14),transparent_42%)]" />
        <div className="relative flex items-center gap-3 text-white/30">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </div>
      </main>
    )
  }

  // No API key → show activation screen
  if (!apiKey) {
    return <ApiKeyScreen onSuccess={() => {}} />
  }

  // Settings dialog for changing API key
  const SettingsDialog = showSettings ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className={`${panelClass} p-6`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={iconShellClass}>
                <Key size={16} strokeWidth={1.5} />
              </span>
              <div>
                <p className="text-sm font-medium text-white">Cài đặt API Key</p>
                <p className="text-xs text-white/40">Quản lý key và xem quota</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.06] text-white/40 transition hover:bg-white/[0.04] hover:text-white"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>

          {/* Quota info */}
          {modelPolicy && (
            <div className="mb-4 rounded-md border border-white/[0.06] bg-[#0a0a0a] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Hạn mức</span>
                <span className="font-medium text-white">
                  {formatTokenCount(modelPolicy.quota.remaining)} / {formatTokenCount(modelPolicy.quota.limit)} tokens
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-[#4DB848] transition-all"
                  style={{ width: `${Math.min(100, (modelPolicy.quota.remaining / modelPolicy.quota.limit) * 100)}%` }}
                />
              </div>
              {modelPolicy.user && (
                <p className="mt-3 text-xs text-white/30">
                  Tài khoản: {modelPolicy.user.name} · Trạng thái: {modelPolicy.user.status}
                </p>
              )}
              {modelPolicy.quota.resets_at && (
                <p className="mt-1 text-xs text-white/25">
                  Reset: {new Date(modelPolicy.quota.resets_at).toLocaleDateString('vi-VN')}
                </p>
              )}
            </div>
          )}

          {/* Refresh quota */}
          <button
            type="button"
            onClick={() => fetchModelPolicy()}
            disabled={isLoadingPolicy}
            className="mb-4 inline-flex items-center gap-2 rounded-md border border-white/[0.08] bg-transparent px-3 py-1.5 text-xs text-white/50 transition hover:bg-white/[0.04] hover:text-white"
          >
            <RefreshCw size={12} className={isLoadingPolicy ? 'animate-spin' : ''} strokeWidth={1.5} />
            Làm mới quota
          </button>

          {/* Current key (masked) */}
          <div className="mb-4">
            <p className="mb-1.5 text-xs text-white/40">Key hiện tại</p>
            <div className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-[#0a0a0a] px-3 py-2">
              <code className="flex-1 text-xs text-white/60 font-mono">
                {apiKey.slice(0, 8)}{'•'.repeat(20)}{apiKey.slice(-4)}
              </code>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                clearApiKey()
                setShowSettings(false)
              }}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-red-500/20 bg-red-500/[0.06] px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/[0.12]"
            >
              <LogOut size={14} strokeWidth={1.5} />
              Xóa key
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-white/[0.08] bg-transparent px-4 py-2 text-sm text-white/60 transition hover:bg-white/[0.04] hover:text-white"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null

  if (showTimetable) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
          <TimetableApp onBackToLanding={() => setShowTimetable(false)} />
        </div>
        {SettingsDialog}
      </>
    )
  }

  return (
    <>
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050505] px-6 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,185,108,0.14),transparent_42%)]" />

        {/* Quota display in top-right */}
        <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
          <QuotaDisplay onSettingsClick={() => setShowSettings(true)} />
        </div>

        <div className="relative flex w-full max-w-4xl flex-1 items-center justify-center">
          <section className="flex w-full max-w-2xl flex-col items-center text-center">
            <Image
              src="/tack.png"
              alt="Tack logo"
              width={168}
              height={168}
              priority
              className="mb-8 h-32 w-32 object-contain sm:h-36 sm:w-36 md:h-40 md:w-40"
            />

            <h1 className="font-[var(--font-poppins)] text-[48px] font-semibold leading-[0.95] tracking-[-0.04em] text-white sm:text-[52px]">
              Tack<span className="text-[#00b96c]">.</span>
            </h1>

            <p className="mt-6 max-w-xl text-[17px] leading-8 font-normal text-[#f0f0f0] sm:text-[18px]">
              Công cụ tạo thời khóa biểu tối giản, giúp bạn quản lý thời gian hiệu quả và chuyên nghiệp hơn mỗi ngày.
            </p>

            <button
              type="button"
              onClick={() => setShowTimetable(true)}
              className="mt-10 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#4DB848] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#40993C]"
            >
              + Tạo thời khóa biểu
            </button>
          </section>
        </div>

        <footer className="relative pb-5 text-center text-[10px] uppercase tracking-[0.28em] text-white/38 sm:pb-6">
          © 2026 TACK STUDIO — DESIGN FOR FOCUS
        </footer>
      </main>
      {SettingsDialog}
    </>
  )
}
