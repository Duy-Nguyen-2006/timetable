import { ArrowLeft, CalendarDays, Check, ChevronRight, Hash, RadioTower, Settings as SettingsIcon, Sun } from 'lucide-react'
import {
  days,
  defaultPeriods,
  iconShellClass,
  navBackClass,
  navBarClass,
  navDisabledClass,
  navNextClass,
  panelClass,
  panelMutedClass,
  sessions,
} from '../constants'
import { DayTile, PeriodControl, SessionTile } from './TimetableFields'

export function SelectPage({
  onBackToLanding,
  canContinue,
  quickImportError,
  aiProvider,
  selectedDays,
  selectedSessions,
  selectedDayNames,
  selectedSessionNames,
  setShowSettingsModal,
  setPage,
  setSelectedDays,
  setSelectedSessions,
  toggleItem,
}) {
  return (
    <section className="app-page relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
      <div className={navBarClass}>
        <button
          type="button"
          onClick={onBackToLanding}
          className={`${navBackClass} ${!onBackToLanding ? navDisabledClass : ''}`}
          disabled={!onBackToLanding}
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Quay lại
        </button>
        <button
          type="button"
          onClick={() => canContinue && setPage('periods')}
          disabled={!canContinue}
          className={`${navNextClass} ${navDisabledClass}`}
        >
          Tiếp tục
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
      </div>

      {quickImportError ? (
        <div className="mb-4 rounded-md border border-red-400/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">
          Nhập dữ liệu nhanh thất bại: {quickImportError}
        </div>
      ) : null}

      <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
            <RadioTower size={14} strokeWidth={1.5} />
            Thiết lập giảng dạy điện tử
          </div>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Chọn ngày dạy và buổi dạy
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-white/40">
            Tích vào các lựa chọn bạn muốn sử dụng. Bỏ tích những mục không cần.
          </p>
        </div>
      </header>

      <div className="mb-6 rounded-lg border border-white/10 bg-[#111] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white/80">
              <SettingsIcon size={16} />
              Cấu hình AI Provider
            </div>
            <p className="mt-1 text-xs text-white/50">
              Cần thiết để sử dụng tính năng xếp lịch tự động bằng AI (LLM + OR-Tools)
            </p>
            {aiProvider ? (
              <div className="mt-2 text-xs text-emerald-400">
                Đã cấu hình: <span className="font-mono">{aiProvider.model}</span>
              </div>
            ) : (
              <div className="mt-2 text-xs text-amber-400">
                Chưa cấu hình — Bắt buộc phải thiết lập trước khi dùng AI
              </div>
            )}
          </div>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="mt-2 w-full rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 active:bg-white/20 sm:mt-0 sm:w-auto"
          >
            {aiProvider ? 'Thay đổi cấu hình' : 'Cấu hình ngay'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <section className={`${panelClass} p-4`}>
          <div className="mb-4 flex items-center gap-2.5">
            <span className={iconShellClass}>
              <CalendarDays size={16} strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">Ngày dạy trong tuần</h2>
              <p className="text-xs text-white/40">Từ thứ hai đến chủ nhật</p>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day) => (
              <DayTile
                key={day.id}
                selected={selectedDays.includes(day.id)}
                title={day.label}
                subtitle={day.short}
                onClick={() => toggleItem(day.id, setSelectedDays)}
              />
            ))}
          </div>
        </section>

        <section className={`${panelClass} p-4`}>
          <div className="mb-4 flex items-center gap-2.5">
            <span className={iconShellClass}>
              <Sun size={16} strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">Chọn buổi học</h2>
              <p className="text-xs text-white/40">Sáng, chiều, tối</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {sessions.map((session) => (
              <SessionTile
                key={session.id}
                selected={selectedSessions.includes(session.id)}
                icon={session.icon}
                title={session.label}
                onClick={() => toggleItem(session.id, setSelectedSessions)}
              />
            ))}
          </div>
        </section>

        <div className={`${panelClass} p-4`}>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#4DB848]">Đã chọn</p>
          <p className="mt-3 text-sm text-white/70">
            {selectedDayNames.length ? selectedDayNames.join(', ') : 'Chưa chọn ngày dạy'}
          </p>
          <div className="my-3 h-px bg-white/[0.06]" />
          <p className="text-sm text-white/70">
            {selectedSessionNames.length ? selectedSessionNames.join(', ') : 'Chưa chọn buổi học'}
          </p>
        </div>
      </div>
    </section>
  )
}

export function PeriodsPage({ selectedDayNames, selectedSessionData, periods, setPage, updatePeriod }) {
  return (
    <section className="app-page relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
      <div className={navBarClass}>
        <button type="button" onClick={() => setPage('select')} className={navBackClass}>
          <ArrowLeft size={14} strokeWidth={1.5} />
          Quay lại
        </button>
        <button type="button" onClick={() => setPage('final')} className={navNextClass}>
          Tiếp tục
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
      </div>
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
            <Hash size={14} strokeWidth={1.5} />
            Thiết lập số tiết tối đa
          </div>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Chọn số tiết tối đa
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-white/40">
            Những ngày và buổi bạn đã chọn được giữ lại. Chỉ các buổi đã chọn mới xuất hiện ở đây.
          </p>
        </div>
        <div className={`${panelClass} p-4 text-sm text-white/50 lg:max-w-md`}>
          <p className="font-medium text-white">Ngày giảng dạy</p>
          <p className="mt-2 leading-6">{selectedDayNames.join(', ')}</p>
        </div>
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_0.55fr]">
        <section className={`${panelClass} p-4`}>
          <div className="mb-4 flex items-center gap-2.5">
            <span className={iconShellClass}>
              <Hash size={16} strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">Các buổi đã chọn</h2>
              <p className="text-xs text-white/40">Thiết lập một số tiết tối đa cho mỗi buổi</p>
            </div>
          </div>

          <div className="grid gap-3">
            {selectedSessionData.map((session) => (
              <PeriodControl
                key={session.id}
                session={session}
                value={periods[session.id] ?? defaultPeriods[session.id]}
                onChange={updatePeriod}
              />
            ))}
          </div>
        </section>

        <aside className={`${panelClass} p-4`}>
          <div className="mb-4 flex items-center gap-2.5">
            <span className={iconShellClass}>
              <Check size={16} strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">Thiết lập của bạn</h2>
              <p className="text-xs text-white/40">Được lưu từ trang đầu tiên</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className={`${panelMutedClass} p-4`}>
              <p className="text-[11px] font-medium uppercase tracking-widest text-white/50">Ngày học</p>
              <p className="mt-2 text-sm text-white/70">{selectedDayNames.join(', ')}</p>
            </div>

            <div className={`${panelMutedClass} p-4`}>
              <p className="text-[11px] font-medium uppercase tracking-widest text-white/50">Số tiết tối đa</p>
              <div className="mt-3 space-y-2">
                {selectedSessionData.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 text-sm text-white/70">
                    <span>{session.label}</span>
                    <span className="rounded bg-[#4DB848]/10 border border-[#4DB848]/20 px-2 py-0.5 text-xs font-medium text-[#4DB848]">
                      {periods[session.id] ?? defaultPeriods[session.id]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
