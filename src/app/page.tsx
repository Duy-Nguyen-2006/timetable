'use client'

import Image from 'next/image'
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
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050505] px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,185,108,0.14),transparent_42%)]" />

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
  )
}
