'use client'

import { useState } from 'react'
import TimetableApp from '@/features/timetable/TimetableApp'

export default function Home() {
  const [showTimetable, setShowTimetable] = useState(false)

  if (showTimetable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <TimetableApp onBackToLanding={() => setShowTimetable(false)} />
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
          Payload đã chuẩn bị sẵn sàng để gửi vào backend mới.
        </p>

        <button
          type="button"
          onClick={() => setShowTimetable(true)}
          className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#4DB848] px-8 text-base font-medium text-[#0a0a0a] transition hover:bg-[#40993C]"
        >
          + Bắt đầu nhập dữ liệu
        </button>

        <div className="mt-6 text-xs text-white/40">
          Toàn bộ phần AI / solver cũ đã được gỡ bỏ. Chỉ còn luồng nhập liệu + xuất payload.
        </div>
      </div>
    </main>
  )
}
