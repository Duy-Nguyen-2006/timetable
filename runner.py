from ortools.sat.python import cp_model


def solve_timetable():
    model = cp_model.CpModel()

    # ==========================================
    # DATA DEFINITION
    # ==========================================
    days = ["Mon", "Tue", "Wed", "Thu", "Fri"]
    day_names_vn = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6"]
    num_days = 5
    num_periods = 7  # periods 1-7
    period_indices = list(range(num_periods))  # 0..6
    # Morning: periods 1-4 (indices 0-3), Afternoon: periods 5-7 (indices 4-6)
    morning_indices = [0, 1, 2, 3]
    afternoon_indices = [4, 5, 6]

    classes = ["6A", "6B", "7A", "7B", "8A", "8B", "9A", "9B"]

    teachers = [
        "Sơn", "Dung", "Hương", "Thuận", "Phương", "Trọng", "Hung",
        "Liễu", "Thúy", "Hiếu", "Lộc", "Học", "Ngân", "Lan", "Thủy",
        "Thắng", "Tin", "Tùng", "Liên", "Hoa"
    ]

    subjects = [
        "Toán", "Văn", "Tiếng Anh", "KHTN", "LS&ĐL", "GDTC", "CN", "GDCD", "Tin", "HĐTN"
    ]

    # Assignments: (teacher, subject, class, lessons_per_week)
    assignments_data = [
        ("Sơn", "Toán", "7A", 5),
        ("Sơn", "Toán", "7B", 5),
        ("Sơn", "Toán", "8B", 5),
        ("Sơn", "Toán", "9B", 5),
        ("Dung", "Toán", "6A", 5),
        ("Dung", "Toán", "6B", 5),
        ("Dung", "Toán", "8A", 5),
        ("Dung", "Toán", "9A", 5),
        ("Hương", "Văn", "6A", 5),
        ("Hương", "Văn", "6B", 5),
        ("Hương", "Văn", "8A", 5),
        ("Thuận", "Văn", "7A", 5),
        ("Thuận", "Văn", "9A", 5),
        ("Phương", "Văn", "7B", 5),
        ("Trọng", "Văn", "8B", 5),
        ("Trọng", "Văn", "9B", 5),
        ("Hung", "Tiếng Anh", "6A", 4),
        ("Hung", "Tiếng Anh", "6B", 4),
        ("Hung", "Tiếng Anh", "7A", 4),
        ("Hung", "Tiếng Anh", "7B", 4),
        ("Hung", "Tiếng Anh", "8A", 4),
        ("Hung", "Tiếng Anh", "8B", 4),
        ("Liễu", "Tiếng Anh", "9A", 4),
        ("Liễu", "Tiếng Anh", "9B", 4),
        ("Thúy", "KHTN", "6A", 4),
        ("Thúy", "KHTN", "6B", 4),
        ("Hiếu", "KHTN", "7A", 4),
        ("Hiếu", "KHTN", "7B", 4),
        ("Lộc", "KHTN", "8A", 4),
        ("Lộc", "KHTN", "8B", 4),
        ("Học", "KHTN", "9A", 4),
        ("Học", "KHTN", "9B", 4),
        ("Lan", "LS&ĐL", "6A", 3),
        ("Lan", "LS&ĐL", "6B", 3),
        ("Lan", "LS&ĐL", "9A", 3),
        ("Lan", "LS&ĐL", "9B", 3),
        ("Ngân", "LS&ĐL", "7A", 3),
        ("Ngân", "LS&ĐL", "7B", 3),
        ("Ngân", "LS&ĐL", "8A", 3),
        ("Ngân", "LS&ĐL", "8B", 3),
        ("Thủy", "GDTC", "6A", 3),
        ("Thủy", "GDTC", "6B", 3),
        ("Thủy", "GDTC", "7A", 3),
        ("Thủy", "GDTC", "7B", 3),
        ("Thủy", "GDTC", "8A", 3),
        ("Thủy", "GDTC", "8B", 3),
        ("Thủy", "GDTC", "9A", 3),
        ("Thủy", "GDTC", "9B", 3),
        ("Thắng", "CN", "6A", 2),
        ("Thắng", "CN", "6B", 2),
        ("Thắng", "CN", "7A", 2),
        ("Thắng", "CN", "7B", 2),
        ("Thắng", "CN", "8A", 2),
        ("Thắng", "CN", "8B", 2),
        ("Thắng", "CN", "9A", 2),
        ("Thắng", "CN", "9B", 2),
        ("Phương", "GDCD", "6A", 2),
        ("Phương", "GDCD", "6B", 2),
        ("Phương", "GDCD", "7A", 2),
        ("Phương", "GDCD", "7B", 2),
        ("Phương", "GDCD", "8A", 2),
        ("Phương", "GDCD", "8B", 2),
        ("Phương", "GDCD", "9A", 2),
        ("Phương", "GDCD", "9B", 2),
        ("Tùng", "HĐTN", "6A", 4),
        ("Tùng", "HĐTN", "6B", 4),
        ("Tùng", "HĐTN", "7A", 4),
        ("Tùng", "HĐTN", "7B", 4),
        ("Tùng", "HĐTN", "8A", 4),
        ("Tùng", "HĐTN", "8B", 4),
        ("Tùng", "HĐTN", "9A", 4),
        ("Liên", "Tin", "7B", 3),
        ("Liên", "Tin", "8B", 2),
        ("Liên", "Tin", "9B", 3),
        ("Hoa", "HĐTN", "7A", 3),
        ("Hoa", "HĐTN", "8A", 3),
        ("Hoa", "HĐTN", "9A", 3),
        ("Hoa", "HĐTN", "9B", 4),
        ("Hoa", "HĐTN", "6A", 2),
        ("Hoa", "HĐTN", "6B", 2),
        ("Hoa", "HĐTN", "8B", 1),
        ("Tin", "Tin", "6A", 1),
        ("Tin", "Tin", "6B", 1),
    ]

    # Build lookup: for each class, total lessons needed
    class_total_lessons = {}
    for c in classes:
        total = 0
        for _, _, cls, lessons in assignments_data:
            if cls == c:
                total += lessons
        class_total_lessons[c] = total
    # Each class should have total = 35 = 5 days * 7 periods
    for c in classes:
        assert class_total_lessons[c] == num_days * num_periods, \
            f"Class {c} has {class_total_lessons[c]} lessons, expected {num_days * num_periods}"

    # ==========================================
    # HARD CONSTRAINT DEFINITIONS
    # ==========================================

    # Thúy không dạy thứ 2 -> Thúy cannot teach on Monday (day index 0)
    thuy_unavailable_days = {0}  # Monday

    # Sơn không dạy tiết 7 thứ 6 -> Sơn cannot teach period 7 (index 6) on Friday (index 4)
    son_unavailable_slots = {(4, 6)}  # (day=4=Friday, period=6=tiết 7)

    # Subjects that must be in morning (periods 1-4, indices 0-3)
    morning_only_subjects = {"Toán", "Văn", "KHTN"}

    # ==========================================
    # CREATE VARIABLES
    # ==========================================
    # assignment[(class_name, subject, teacher, d, p)] is 1 if teacher t teaches subject s to class c at day d, period p
    assignment = {}
    all_assignments_list = []

    for teacher, subject, class_name, lessons in assignments_data:
        for d in range(num_days):
            for p in range(num_periods):
                # Skip forbidden slots
                # Thúy không dạy thứ 2
                if teacher == "Thúy" and d in thuy_unavailable_days:
                    continue
                # Sơn không dạy tiết 7 thứ 6
                if teacher == "Sơn" and (d, p) in son_unavailable_slots:
                    continue
                # Toán, Văn, KHTN must be in morning
                if subject in morning_only_subjects and p not in morning_indices:
                    continue
                var = model.NewBoolVar(
                    f"a_{class_name}_{subject}_{teacher}_{days[d]}_p{p+1}"
                )
                assignment[(class_name, subject, teacher, d, p)] = var
                all_assignments_list.append(var)

    print(f"Total boolean variables created: {len(assignment)}")

    # ==========================================
    # HARD CONSTRAINTS
    # ==========================================

    # 1. EXACT LESSON COUNT
    for teacher, subject, class_name, lessons in assignments_data:
        relevant_vars = []
        for d in range(num_days):
            for p in range(num_periods):
                key = (class_name, subject, teacher, d, p)
                if key in assignment:
                    relevant_vars.append(assignment[key])
        model.Add(sum(relevant_vars) == lessons)

    # 2. NO TEACHER CONFLICT
    for teacher in teachers:
        for d in range(num_days):
            for p in range(num_periods):
                vars_at_slot = []
                for class_name in classes:
                    for subject in subjects:
                        key = (class_name, subject, teacher, d, p)
                        if key in assignment:
                            vars_at_slot.append(assignment[key])
                if vars_at_slot:
                    model.Add(sum(vars_at_slot) <= 1)

    # 3. NO CLASS CONFLICT
    for class_name in classes:
        for d in range(num_days):
            for p in range(num_periods):
                vars_at_slot = []
                for teacher_name in teachers:
                    for subject in subjects:
                        key = (class_name, subject, teacher_name, d, p)
                        if key in assignment:
                            vars_at_slot.append(assignment[key])
                # Each class must have exactly 1 subject per slot
                model.Add(sum(vars_at_slot) == 1)

    # ==========================================
    # SOFT CONSTRAINTS (Objective)
    # ==========================================
    soft_reward_terms = []
    soft_penalty_terms = []

    # Soft 1: Không xếp Toán tiết 7 -> Penalty if Toán is in period 7 (index 6)
    # Since Toán is already constrained to morning, this should never happen,
    # but we add a penalty just in case.
    for teacher, subject, class_name, lessons in assignments_data:
        if subject == "Toán":
            for d in range(num_days):
                key = (class_name, subject, teacher, d, 6)  # period 7 (index 6)
                if key in assignment:
                    soft_penalty_terms.append(assignment[key])

    # Soft 2: Không xếp Văn tiết 7 -> Penalty if Văn is in period 7 (index 6)
    for teacher, subject, class_name, lessons in assignments_data:
        if subject == "Văn":
            for d in range(num_days):
                key = (class_name, subject, teacher, d, 6)
                if key in assignment:
                    soft_penalty_terms.append(assignment[key])

    # Soft 3: HĐTN nên buổi chiều -> Reward if HĐTN is in afternoon (indices 4-6)
    for teacher, subject, class_name, lessons in assignments_data:
        if subject == "HĐTN":
            for d in range(num_days):
                for p in afternoon_indices:
                    key = (class_name, subject, teacher, d, p)
                    if key in assignment:
                        soft_reward_terms.append(assignment[key])

    # Soft 4: Mỗi giáo viên không dạy quá 6 tiết liên tiếp
    # Penalize if a teacher teaches ALL 7 periods on a single day (the only way to have 7 consecutive)
    consecutive_penalties = []
    for teacher in teachers:
        for d in range(num_days):
            # Create a variable that is 1 if teacher teaches at ALL 7 periods on this day
            teach_all_7 = model.NewBoolVar(f"teach_all7_{teacher}_{days[d]}")
            # For each period, get the variable indicating if this teacher is teaching
            period_vars = []
            for p in range(num_periods):
                vars_at_p = []
                for class_name in classes:
                    for subject in subjects:
                        key = (class_name, subject, teacher, d, p)
                        if key in assignment:
                            vars_at_p.append(assignment[key])
                if vars_at_p:
                    # This teacher teaches at period p if any of these vars is 1
                    period_active = model.NewBoolVar(f"active_{teacher}_{days[d]}_p{p+1}")
                    model.Add(sum(vars_at_p) >= 1).OnlyEnforceIf(period_active)
                    model.Add(sum(vars_at_p) == 0).OnlyEnforceIf(period_active.Not())
                    period_vars.append(period_active)
                else:
                    # Teacher cannot teach at this period (all forbidden), so create a fixed 0 var
                    period_active = model.NewBoolVar(f"active_{teacher}_{days[d]}_p{p+1}_zero")
                    model.Add(period_active == 0)
                    period_vars.append(period_active)

            # teach_all_7 = 1 iff sum(period_vars) == 7
            model.Add(sum(period_vars) >= 7).OnlyEnforceIf(teach_all_7)
            model.Add(sum(period_vars) <= 6).OnlyEnforceIf(teach_all_7.Not())
            consecutive_penalties.append(teach_all_7)

    # Also penalize if a teacher teaches 6 consecutive periods AND the 7th is also taught
    # Actually, the constraint says "quá 6 tiết liên tiếp" = more than 6 consecutive periods.
    # With 7 periods total, the only way to have MORE than 6 consecutive is all 7.
    # But what about across days? Let's also check for 6 consecutive across the week boundary.
    # For simplicity, we'll stick with the per-day check.

    # Weights
    # Penalty weights (negative in objective)
    WEIGHT_TOAN_TIET7 = 5
    WEIGHT_VAN_TIET7 = 5
    WEIGHT_HDTN_CHIEU = 3
    WEIGHT_CONSECUTIVE = 10

    objective = (
        WEIGHT_HDTN_CHIEU * sum(soft_reward_terms)
        - WEIGHT_TOAN_TIET7 * sum(soft_penalty_terms)
        - WEIGHT_CONSECUTIVE * sum(consecutive_penalties)
    )

    model.Maximize(objective)

    # ==========================================
    # SOLVE
    # ==========================================
    solver = cp_model.CpSolver()
    solver.parameters.log_search_progress = True
    solver.parameters.num_search_workers = 8
    solver.parameters.max_time_in_seconds = 120.0
    status = solver.Solve(model)

    # ==========================================
    # OUTPUT
    # ==========================================
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        print("SOLUTION FOUND")
        print(f"Solver status: {'OPTIMAL' if status == cp_model.OPTIMAL else 'FEASIBLE'}")
        print(f"Objective value: {solver.ObjectiveValue()}")
        print()

        # Build schedule data structures for output
        # class_schedule[class_name][d][p] = (teacher, subject)
        class_schedule = {}
        for c in classes:
            class_schedule[c] = []
            for d in range(num_days):
                day_sched = []
                for p in range(num_periods):
                    found = False
                    for t in teachers:
                        for s in subjects:
                            key = (c, s, t, d, p)
                            if key in assignment and solver.Value(assignment[key]) == 1:
                                day_sched.append((t, s))
                                found = True
                                break
                        if found:
                            break
                    if not found:
                        day_sched.append(("", ""))
                class_schedule[c].append(day_sched)

        # Print per-class timetable
        for c in classes:
            print(f"\n=== {c} Timetable ===")
            header = f"{'Day':8s} | " + " | ".join([f"Tiết {p+1}" for p in range(num_periods)])
            print(header)
            print("-" * len(header))
            for d in range(num_days):
                row = f"{days[d]:8s} | "
                for p in range(num_periods):
                    t, s = class_schedule[c][d][p]
                    row += f"{s}-{t:10s} | " if t else f"{'':13s} | "
                print(row)

        # Print teacher schedule summary
        print("\n=== Teacher Schedule Summary ===")
        for t in teachers:
            print(f"\n--- {t} ---")
            total_lessons = 0
            for d in range(num_days):
                for p in range(num_periods):
                    for c in classes:
                        for s in subjects:
                            key = (c, s, t, d, p)
                            if key in assignment and solver.Value(assignment[key]) == 1:
                                print(f"  {days[d]} Tiết {p+1}: {c} - {s}")
                                total_lessons += 1
            print(f"  Total lessons: {total_lessons}")

        # Print soft constraint analysis
        print("\n=== Soft Constraint Analysis ===")

        # Check Toán tiết 7
        toan_tiet7_count = 0
        for teacher, subject, class_name, lessons in assignments_data:
            if subject == "Toán":
                for d in range(num_days):
                    key = (class_name, subject, teacher, d, 6)
                    if key in assignment and solver.Value(assignment[key]) == 1:
                        toan_tiet7_count += 1
        print(f"Toán ở tiết 7: {toan_tiet7_count} (penalty if > 0)")

        # Check Văn tiết 7
        van_tiet7_count = 0
        for teacher, subject, class_name, lessons in assignments_data:
            if subject == "Văn":
                for d in range(num_days):
                    key = (class_name, subject, teacher, d, 6)
                    if key in assignment and solver.Value(assignment[key]) == 1:
                        van_tiet7_count += 1
        print(f"Văn ở tiết 7: {van_tiet7_count} (penalty if > 0)")

        # Check HĐTN buổi chiều
        hdtn_chieu_count = 0
        hdtn_total = 0
        for teacher, subject, class_name, lessons in assignments_data:
            if subject == "HĐTN":
                for d in range(num_days):
                    for p in range(num_periods):
                        key = (class_name, subject, teacher, d, p)
                        if key in assignment:
                            val = solver.Value(assignment[key])
                            hdtn_total += val
                            if p in afternoon_indices:
                                hdtn_chieu_count += val
        print(f"HĐTN buổi chiều: {hdtn_chieu_count}/{hdtn_total} (reward more)")

        # Check consecutive teaching
        print("\nConsecutive teaching check (teachers teaching all 7 periods on a day):")
        for teacher in teachers:
            for d in range(num_days):
                count = 0
                for p in range(num_periods):
                    for c in classes:
                        for s in subjects:
                            key = (c, s, teacher, d, p)
                            if key in assignment and solver.Value(assignment[key]) == 1:
                                count += 1
                                break
                if count == 7:
                    print(f"  {teacher} dạy cả 7 tiết ngày {days[d]} (vi phạm)")

        # Store data for result.md generation
        solver_data = {
            "class_schedule": class_schedule,
            "classes": classes,
            "days": days,
            "day_names_vn": day_names_vn,
            "num_periods": num_periods,
            "status": status,
            "objective": solver.ObjectiveValue(),
        }

        return solver_data
    else:
        print("NO SOLUTION FOUND")
        print(f"Solver status: {status}")
        if status == cp_model.INFEASIBLE:
            print("The model is infeasible.")
        return None


def generate_result_md(solver_data):
    """Generate result.md from solver data"""
    if solver_data is None:
        with open("result.md", "w") as f:
            f.write("# Timetable Result\n\nNo solution found.\n")
        return

    class_schedule = solver_data["class_schedule"]
    classes = solver_data["classes"]
    day_names_vn = solver_data["day_names_vn"]
    num_periods = solver_data["num_periods"]

    lines = []
    lines.append("# THỜI KHÓA BIỂU")
    lines.append("## Học kỳ II - Năm học 2025-2026")
    lines.append(f"- **Trường**: THCS (Dataset 6)")
    lines.append(f"- **Buổi**: Sáng (Tiết 1-4) + Chiều (Tiết 5-7)")
    lines.append(f"- **Số lớp**: {', '.join(classes)}")
    lines.append("")

    # Create a table for each class
    for c in classes:
        lines.append(f"### Lớp {c}")
        lines.append("")

        # Header row
        header_cells = ["Thứ", "Tiết"]
        lines.append("| " + " | ".join(header_cells) + " | Môn | GV Dạy |")
        lines.append("| " + " | ".join(["---"] * len(header_cells)) + " | --- | --- |")

        for d in range(len(day_names_vn)):
            for p in range(num_periods):
                row_cells = []
                if p == 0:
                    row_cells.append(day_names_vn[d])
                else:
                    row_cells.append("")
                row_cells.append(str(p + 1))

                t, s = class_schedule[c][d][p]
                if t:
                    row_cells.append(s)
                    row_cells.append(t)
                else:
                    row_cells.append("")
                    row_cells.append("")

                lines.append("| " + " | ".join(row_cells) + " |")
        lines.append("")

    # Combined timetable for all classes
    lines.append("## Thời khóa biểu tổng hợp")
    lines.append("")

    # Header: Thứ | Tiết | 6A | GV Dạy | 6B | GV Dạy | 7A | GV Dạy | ...
    header_cells = ["Thứ", "Tiết"]
    for c in classes:
        header_cells.append(c)
        header_cells.append("GV Dạy")
    lines.append("| " + " | ".join(header_cells) + " |")
    lines.append("| " + " | ".join(["---"] * len(header_cells)) + " |")

    for d in range(len(day_names_vn)):
        for p in range(num_periods):
            row_cells = []
            if p == 0:
                row_cells.append(day_names_vn[d])
            else:
                row_cells.append("")
            row_cells.append(str(p + 1))

            for c in classes:
                t, s = class_schedule[c][d][p]
                if t:
                    row_cells.append(s)
                    row_cells.append(t)
                else:
                    row_cells.append("")
                    row_cells.append("")

            lines.append("| " + " | ".join(row_cells) + " |")

    lines.append("")
    lines.append("## Ghi chú")
    lines.append("- **Buổi sáng**: Tiết 1-4")
    lines.append("- **Buổi chiều**: Tiết 5-7")
    lines.append("- **Ràng buộc cứng**: Toán, Văn, KHTN chỉ xếp buổi sáng; Thúy không dạy thứ 2; Sơn không dạy tiết 7 thứ 6")
    lines.append("- **Ràng buộc mềm**: HĐTN ưu tiên buổi chiều; Hạn chế Toán/Văn tiết 7; Không dạy quá 6 tiết liên tiếp")

    with open("result.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("\nresult.md has been created successfully.")


if __name__ == "__main__":
    solver_data = solve_timetable()
    if solver_data:
        generate_result_md(solver_data)