"""
output_formatter.py

Module hỗ trợ format kết quả thời khóa biểu theo đúng định dạng của Format.csv
(Trường THCS style - có header 2 dòng + cột Thứ, Tiết, Lớp + GV Dạy).

Mục tiêu chính: Sinh ra file Result.csv giống hệt cấu trúc Format.csv.
"""

from typing import Dict, List, Tuple, Optional
import csv
from io import StringIO


def generate_result_csv(
    schedule: Dict[Tuple[str, str, str], Tuple[str, str]],  # key: (class_id, day, period) -> (subject, teacher)
    classes: List[str],
    days: List[str],
    periods: List[str],
    school_name: str = "TRƯỜNG THCS TRƯỜNG SƠN",
    semester_info: str = "HỌC KỲ II - NĂM HỌC 2025-2026",
    title: str = "THỜI KHÓA BIỂU BUỔI SÁNG",
    serial: str = "Số 1"
) -> str:
    """
    Sinh ra nội dung file CSV theo đúng format Format.csv.

    Cấu trúc giống hệt:
    - Dòng 1: UBND XÃ ... + title + serial
    - Dòng 2: Tên trường + semester_info
    - Dòng 3: Header: Thứ,Tiết,6A,GV Dạy,6B,GV Dạy,...
    - Dữ liệu: Thứ chỉ hiện ở tiết đầu tiên của ngày
    """
    output = StringIO()
    writer = csv.writer(output)

    # Dòng 1
    row1 = ["UBND XÃ TRƯỜNG VĂN"] + [""] * (len(classes) * 2 + 1)
    row1[5] = title
    row1[-1] = serial
    writer.writerow(row1)

    # Dòng 2
    row2 = [school_name] + [""] * (len(classes) * 2 + 1)
    row2[5] = semester_info
    writer.writerow(row2)

    # Dòng 3 - Header
    header = ["Thứ", "Tiết"]
    for cls in classes:
        header.extend([cls, "GV Dạy"])
    writer.writerow(header)

    # Dữ liệu
    for d_idx, day in enumerate(days):
        for p_idx, period in enumerate(periods):
            row = []
            # Thứ chỉ hiện ở tiết đầu
            if p_idx == 0:
                row.append(str(d_idx + 2))   # Thứ 2 = 2, Thứ 3 = 3...
            else:
                row.append("")

            row.append(period)

            for cls in classes:
                key = (cls, day, period)
                if key in schedule:
                    subject, teacher = schedule[key]
                    row.append(subject)
                    row.append(teacher)
                else:
                    row.append("")
                    row.append("")

            writer.writerow(row)

    return output.getvalue()


def generate_timetable_markdown(
    schedule: Dict[Tuple[str, str, str], Tuple[str, str]],
    classes: List[str],
    days: List[str],
    periods: List[str],
    title: str = "THỜI KHÓA BIỂU",
    subtitle: str = "",
    metadata: Optional[dict] = None
) -> str:
    """Phiên bản Markdown (giữ lại để tham khảo, không dùng cho Result.csv)."""
    lines = []
    lines.append(f"# {title}")
    if subtitle:
        lines.append(f"## {subtitle}")
    if metadata:
        for k, v in metadata.items():
            lines.append(f"- **{k}**: {v}")
    lines.append("")

    header = ["Thứ", "Tiết"] + [f"{cls} | GV Dạy" for cls in classes]
    lines.append("| " + " | ".join(header) + " |")
    lines.append("| " + " | ".join(["---"] * len(header)) + " |")

    for d_idx, day in enumerate(days):
        for p_idx, period in enumerate(periods):
            row = []
            row.append(day if p_idx == 0 else "")
            row.append(period)
            for cls in classes:
                key = (cls, day, period)
                if key in schedule:
                    subject, teacher = schedule[key]
                    row.append(subject)
                    row.append(teacher)
                else:
                    row.append("")
                    row.append("")
            lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


# ==================== Hỗ trợ luồng mới (results.txt → Result.csv) ====================

def load_schedule_from_results_txt(path: str = "results.txt"):
    """
    Đọc file results.txt (định dạng JSON) do runner.py xuất ra.
    Trả về dict schedule phù hợp để dùng với generate_result_csv.
    """
    import json
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    schedule = {}
    for entry in data.get("schedule", []):
        key = (entry["class"], entry["day"], entry["period"])
        schedule[key] = (entry["subject"], entry["teacher"])

    return schedule, data.get("classes", []), data.get("days", []), data.get("periods", [])


def convert_results_txt_to_Result_csv(
    input_txt: str = "results.txt",
    output_csv: str = "Result.csv",
    **kwargs
) -> str:
    """
    Hàm chính dùng để chuyển results.txt thành Result.csv theo đúng format Format.csv.
    """
    schedule, classes, days, periods = load_schedule_from_results_txt(input_txt)

    csv_content = generate_result_csv(
        schedule=schedule,
        classes=classes,
        days=days,
        periods=periods,
        **kwargs
    )

    with open(output_csv, "w", encoding="utf-8", newline="") as f:
        f.write(csv_content)

    return f"Đã tạo thành công {output_csv}"
