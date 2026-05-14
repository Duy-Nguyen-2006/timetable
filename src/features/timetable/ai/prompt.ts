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

  const systemPrompt = 'Dựa vào những sự kiện sau, hãy viết code để tạo thời khóa biểu và chạy trong môi trường này: (Nội dung được tổng hợp, bao gồm những buổi học, ràng buộc xếp lịch, phân công chuyên môn). Yêu cầu: Code bằng ortools, nếu code chạy có kết quả hợp lệ, trả kết quả cho người dùng là thời khóa biểu được xếp, nếu không có, trả về: Không thể xếp thời khóa biểu hợp lệ.'

  const userPrompt = `Hãy xếp thời khóa biểu từ dữ liệu JSON sau. Trả về kết quả cuối cùng bằng tiếng Việt, ưu tiên bảng markdown rõ ràng. Nếu không thể xếp hợp lệ, chỉ trả về đúng câu: Không thể xếp thời khóa biểu hợp lệ.\n\n${JSON.stringify(summarizedInput, null, 2)}`

  return { systemPrompt, userPrompt }
}
