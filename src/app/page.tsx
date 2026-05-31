'use client'

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 text-white">
      <div className="text-center max-w-xl">
        <div className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[#4DB848]">
          Data entry workspace
        </div>
        <h1 className="text-6xl font-semibold tracking-tighter">
          Tack Timetable
        </h1>
        <p className="mt-4 text-lg text-white/70">
          Nhập dữ liệu giáo viên, môn, lớp, phân công và ràng buộc.<br />
          AI sẽ tạo thời khóa biểu cuối cùng và kiểm tra ràng buộc cứng trước khi trả kết quả.
        </p>

        <button
          type="button"
          onClick={() => {
            setQuickImportPayload(null)
            setShowTimetable(true)
          }}
          className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#4DB848] px-8 text-base font-medium text-[#0a0a0a] transition hover:bg-[#40993C]"
        >
          + Bắt đầu nhập dữ liệu
        </button>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowQuickImport((current) => !current)}
            className="inline-flex h-10 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.03] px-5 text-sm font-medium text-white/80 transition hover:bg-white/[0.08]"
          >
            Nhập dữ liệu nhanh
          </button>
        </div>

        {showQuickImport ? (
          <section className="mt-4 rounded-md border border-white/[0.1] bg-[#101010] p-4 text-left">
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
      </div>
    </main>
  )
}
