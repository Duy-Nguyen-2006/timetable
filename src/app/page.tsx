'use client'

import Image from 'next/image'
import { useEffect, useSyncExternalStore, useState } from 'react'
import { Key, LogOut, X, RefreshCw, Loader2, Sparkles, ShieldCheck, Wand2 } from 'lucide-react'

import TimetableApp from '@/features/timetable/TimetableApp'
import ApiKeyScreen from '@/features/timetable/ApiKeyScreen'
import QuotaDisplay from '@/features/timetable/QuotaDisplay'
import { useApiKeyStore, formatTokenCount, hydrateApiKeyFromStorage } from '@/features/timetable/ai/api-key-store'
import { panelClass, iconShellClass } from '@/features/timetable/constants'

const emptySubscribe = () => () => {}
function getSnapshot() { return true }
function getServerSnapshot() { return false }

const featureItems = [
  {
    icon: Wand2,
    title: 'Tạo lịch bằng AI',
    description: 'Nhập dữ liệu lớp, môn và ràng buộc để hệ thống tự dựng thời khóa biểu khả thi.',
  },
  {
    icon: ShieldCheck,
    title: 'Kiểm tra ràng buộc',
    description: 'Kết quả được kiểm tra lại để phát hiện xung đột giáo viên, tiết học và điều kiện cứng.',
  },
  {
    icon: Sparkles,
    title: 'Tối giản để tập trung',
    description: 'Flow gọn, rõ và phù hợp cho thao tác nhanh khi cần thử nhiều phương án lịch khác nhau.',
  },
] as const

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

          <div className="relative flex w-full max-w-6xl flex-1 items-center justify-center py-16">
            <section className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] lg:gap-14">
              <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                <Image
                  src="/tack.png"
                  alt="Tack logo"
                  width={168}
                  height={168}
                  priority
                  className="mb-8 h-32 w-32 object-contain sm:h-36 sm:w-36 md:h-40 md:w-40 lg:mb-6"
                />

                <div className="inline-flex items-center gap-2 rounded-full border border-[#4DB848]/20 bg-[#4DB848]/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[#9BE28C]">
                  <Sparkles size={12} strokeWidth={1.8} />
                  AI timetable workspace
                </div>

                <h1 className="mt-6 font-[var(--font-poppins)] text-[48px] font-semibold leading-[0.95] tracking-[-0.04em] text-white sm:text-[52px] lg:text-[64px]">
                  Tack<span className="text-[#00b96c]">.</span>
                </h1>

                <p className="mt-6 max-w-xl text-[17px] leading-8 font-normal text-[#f0f0f0] sm:text-[18px]">
                  Công cụ tạo thời khóa biểu tối giản, giúp bạn nhập ràng buộc nhanh, sinh phương án bằng AI và rà lại chất lượng trước khi xuất kết quả.
                </p>

                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setShowTimetable(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#4DB848] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#40993C]"
                  >
                    + Tạo thời khóa biểu
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-5 text-sm font-medium text-white/70 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    <Key size={14} strokeWidth={1.7} />
                    Quản lý API key
                  </button>
                </div>

                <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Input</p>
                    <p className="mt-2 text-sm text-white/75">Lớp, giáo viên, môn học, số tiết và ràng buộc.</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Engine</p>
                    <p className="mt-2 text-sm text-white/75">Model sinh solver artifact, backend chạy và checker xác nhận.</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/35">Output</p>
                    <p className="mt-2 text-sm text-white/75">Lịch học khả thi cùng báo cáo lỗi hoặc gợi ý retry khi cần.</p>
                  </div>
                </div>
              </div>

              <aside className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur">
                <div className="rounded-2xl border border-white/[0.06] bg-[#0b0b0b] p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">Điểm nổi bật</p>
                  <div className="mt-4 space-y-3">
                    {featureItems.map(({ icon: Icon, title, description }) => (
                      <div key={title} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-[#4DB848]/20 bg-[#4DB848]/10 text-[#9BE28C]">
                            <Icon size={18} strokeWidth={1.8} />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-white">{title}</p>
                            <p className="mt-1 text-sm leading-6 text-white/55">{description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl border border-dashed border-white/[0.08] bg-[#050505] p-4">
                    <p className="text-xs font-medium text-white/80">Luồng đề xuất</p>
                    <ol className="mt-3 space-y-2 text-sm leading-6 text-white/50">
                      <li>1. Kiểm tra API key và quota.</li>
                      <li>2. Nhập danh sách lớp, giáo viên, môn và ràng buộc.</li>
                      <li>3. Chạy sinh lịch, xem báo cáo checker và xuất kết quả.</li>
                    </ol>
                  </div>
                </div>
              </aside>
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
