import { ArrowLeft, CalendarDays, ChevronRight, RotateCcw, Trash2 } from 'lucide-react'
import { defaultPeriods, ghostButtonClass, navBackClass, navBarClass, navDisabledClass, navNextClass, panelClass, panelMutedClass } from '../constants'
import { getCellKey } from '../utils'

export function PreviewPage({
  activePeriodCount,
  deletedPeriods,
  periods,
  selectedSessionData,
  selectedSpreadsheetDays,
  timetableRows,
  restoreDeletedPeriods,
  setPage,
  toggleDeletedPeriod,
}) {
  return (
    <section className="app-page relative flex min-h-screen w-full flex-col px-4 py-6 sm:px-8 lg:px-12 xl:px-16">
      <div className={navBarClass}>
        <button type="button" onClick={() => setPage('periods')} className={navBackClass}>
          <ArrowLeft size={14} strokeWidth={1.5} />
          Quay lại
        </button>
        <button
          type="button"
          onClick={() => activePeriodCount > 0 && setPage('details')}
          disabled={activePeriodCount <= 0}
          className={`${navNextClass} ${navDisabledClass}`}
        >
          Tiếp tục
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
      </div>
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-white/30">
            <CalendarDays size={14} strokeWidth={1.5} />
            Bảng thời khóa biểu mẫu
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Xem trước thời khóa biểu điện tử</h1>
          <p className="mt-3 max-w-3xl text-sm text-white/40">
            Nhấn vào từng ô tiết học để xóa riêng ô đó theo từng ngày. Nhấn lại để khôi phục.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
          <div className={`${panelClass} px-4 py-2.5 text-sm text-white/50`}>
            <span className="font-medium text-white">Số tiết đang hoạt động:</span> {activePeriodCount}
          </div>
          <button type="button" onClick={restoreDeletedPeriods} className={ghostButtonClass}>
            <RotateCcw size={14} strokeWidth={1.5} />
            Khôi phục tất cả
          </button>
        </div>
      </header>

      <div className={`${panelClass} flex-1 overflow-hidden p-3 sm:p-4`}>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          {selectedSessionData.map((session) => {
            const sessionTotal = selectedSpreadsheetDays.reduce(
              (total, day) =>
                total +
                Array.from({ length: periods[session.id] ?? defaultPeriods[session.id] }, (_, index) => index + 1).filter(
                  (period) => !deletedPeriods[getCellKey(day.id, session.id, period)],
                ).length,
              0,
            )

            return (
              <div key={session.id} className={`${panelMutedClass} p-4`}>
                <p className="text-[11px] font-medium uppercase tracking-widest text-white/50">{session.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{sessionTotal}</p>
                <p className="text-xs text-white/30">ô tiết vẫn đang bật</p>
              </div>
            )
          })}
        </div>

        <div className="h-full overflow-auto rounded-md border border-white/[0.06] bg-[#141414] text-white">
          <table className="min-w-[900px] w-full border-separate border-spacing-0 table-fixed text-left text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 h-10 w-24 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-[11px] font-semibold uppercase tracking-widest text-white/90">
                  Buổi
                </th>
                <th className="sticky left-24 top-0 z-20 h-10 w-16 border-b border-r border-white/[0.06] bg-[#141414] px-2 text-center text-[11px] font-semibold uppercase tracking-widest text-white/90">
                  Tiết
                </th>
                {selectedSpreadsheetDays.map((day) => (
                  <th
                    key={day.id}
                    className="sticky top-0 z-10 h-12 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-center text-sm font-semibold text-white"
                  >
                    {day.tableLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timetableRows.map((row) => (
                <tr key={row.id} className="h-10">
                  {row.firstInSession ? (
                    <td rowSpan={row.sessionPeriodCount} className="sticky left-0 z-10 w-24 border-b border-r border-white/[0.06] bg-[#141414] px-3 text-center align-middle">
                      <span className="text-xs font-semibold text-white">{row.sessionLabel}</span>
                    </td>
                  ) : null}
                  <td className="sticky left-24 z-10 w-16 border-b border-r border-white/[0.06] bg-[#141414] px-2 text-center align-middle">
                    <span className="text-xs font-semibold text-white">{row.period}</span>
                  </td>
                  {selectedSpreadsheetDays.map((day) => {
                    const cellKey = getCellKey(day.id, row.sessionId, row.period)
                    const isDeleted = deletedPeriods[cellKey]

                    return (
                      <td key={cellKey} className="border-b border-r border-white/[0.04] p-1.5">
                        <button
                          type="button"
                          onClick={() => toggleDeletedPeriod(day.id, row.sessionId, row.period)}
                          className={`group flex h-7 w-full items-center justify-between gap-2 rounded border px-2 text-center text-xs font-medium transition ${
                            isDeleted
                              ? 'border-green-500/25 bg-green-500/[0.08] text-green-400 hover:bg-green-500/[0.14] hover:border-green-500/35'
                              : 'border-white/[0.06] bg-[#141414] text-white/50 hover:border-white/[0.12]'
                          }`}
                          aria-label={`${isDeleted ? 'Khôi phục' : 'Xóa'} ${day.label} ${row.sessionLabel} tiết ${row.period}`}
                        >
                          <span className={isDeleted ? 'mx-auto inline-flex items-center gap-1.5' : 'min-w-0 flex-1'}>
                            {isDeleted ? (
                              <>
                                <RotateCcw size={11} strokeWidth={1.5} />
                                Restore
                              </>
                            ) : (
                              row.period
                            )}
                          </span>
                          {!isDeleted && (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-red-400/60 group-hover:text-red-400">
                              <Trash2 size={16} strokeWidth={1.5} />
                            </span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
