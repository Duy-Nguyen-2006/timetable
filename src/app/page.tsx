'use client'

import Image from 'next/image'
import { useState } from 'react'
import TimetableApp from '@/features/timetable/TimetableApp'
import { QUICK_IMPORT_SAMPLE_TEXT } from '@/features/timetable/quick-import'

export default function Home() {
  const [showTimetable, setShowTimetable] = useState(false)
  const [showQuickImport, setShowQuickImport] = useState(false)
  const [quickDatasetText, setQuickDatasetText] = useState(QUICK_IMPORT_SAMPLE_TEXT)
  const [quickImportPayload, setQuickImportPayload] = useState<string | null>(null)

  if (showTimetable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <TimetableApp
          onBackToLanding={() => setShowTimetable(false)}
          quickDatasetText={quickImportPayload}
        />
      </div>
    )
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050505] px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,185,108,0.14),transparent_42%)]" />

      <div className="relative flex w-full max-w-4xl flex-1 items-center justify-center py-16">
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
            onClick={() => {
              setQuickImportPayload(null)
              setShowTimetable(true)
            }}
            className="mt-10 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#4DB848] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#40993C]"
          >
            + Tạo thời khóa biểu
          </button>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowQuickImport((current) => !current)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] font-medium text-white/80 transition hover:bg-white/[0.08]"
            >
              Nhập dữ liệu nhanh
            </button>
          </div>

          {showQuickImport ? (
            <section className="mt-5 w-full rounded-md border border-white/[0.1] bg-[#101010]/80 p-4 text-left backdrop-blur">
              <p className="mb-2 text-xs text-white/55">
                Dán dataset theo format mẫu, hệ thống chỉ điền dữ liệu để bạn kiểm tra rồi tự bấm xếp lịch.
              </p>
              <textarea
                value={quickDatasetText}
                onChange={(event) => setQuickDatasetText(event.target.value)}
                rows={18}
                className="min-h-72 w-full rounded-md border border-white/[0.1] bg-[#0a0a0a] px-3 py-2 text-xs text-white outline-none transition focus:border-white/25"
              />
              <button
                type="button"
                onClick={() => {
                  if (!quickDatasetText.trim()) return
                  setQuickImportPayload(quickDatasetText)
                  setShowTimetable(true)
                }}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-[#4DB848] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#40993C]"
              >
                Dùng dữ liệu này
              </button>
            </section>
          ) : null}

          <div className="mt-6 text-xs text-white/40">
            Dữ liệu và tối đa 3 kết quả gần nhất được lưu cục bộ trên máy để tái sử dụng.
          </div>
        </section>
      </div>

      <footer className="relative pb-5 text-center text-[10px] uppercase tracking-[0.28em] text-white/38 sm:pb-6">
        © 2026 TACK STUDIO — DESIGN FOR FOCUS
      </footer>
    </main>
  )
}
