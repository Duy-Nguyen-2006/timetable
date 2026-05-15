export function buildTimetablePayload(input: any) {
  const { days: selectedDays, sessions: selectedSessions, periodCounts, deletedPeriods, assignments, constraints } = input

  const timetableSlots = selectedDays.map((day: any) => ({
    id: day.id,
    label: day.label,
    slots: selectedSessions.flatMap((session: any) => {
      const count = periodCounts[session.id]
      return Array.from({ length: count }, (_, index) => {
        const period = index + 1
        const key = `${day.id}-${session.id}-${period}`
        if (deletedPeriods[key]) return []
        return [{
          dayId: day.id,
          dayLabel: day.label,
          sessionId: session.id,
          sessionLabel: session.label,
          period,
          slotId: key,
        }]
      }).flat()
    }),
  }))

  return {
    khung_thoi_khoa_bieu: timetableSlots,
    phan_cong_chuyen_mon: assignments.map((assignment: any) => ({
      giao_vien: assignment.teacher,
      mon_hoc: assignment.subject,
      lop: assignment.className,
      so_tiet_moi_tuan: assignment.weeklyPeriods,
    })),
    rang_buoc_xep_lich: constraints.map((constraint: any) => ({
      loai: constraint.type === 'required' ? 'Bắt buộc' : 'Nên có',
      noi_dung: constraint.text,
    })),
  }
}

export function buildTimetablePrompts(input: any) {
  const summarizedInput = buildTimetablePayload(input)

  const systemPrompt = 'Bạn nhận dữ liệu thời khóa biểu đã được cấu trúc. Nhiệm vụ của bạn là diễn giải hoặc chuẩn hóa ràng buộc bằng tiếng Việt ngắn gọn khi cần. Không sinh mã nguồn, không giả định đang thực thi solver, không trả markdown dài dòng.'

  const userPrompt = `Hãy đọc dữ liệu JSON sau và diễn giải ngắn gọn các ràng buộc hoặc điểm cần chú ý nếu được yêu cầu. Dữ liệu solve chính sẽ được xử lý nội bộ.\n\n${JSON.stringify(summarizedInput, null, 2)}`

  return { systemPrompt, userPrompt }
}
