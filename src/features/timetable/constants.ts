import type { DayInfo, SessionInfo } from "./types";

export const days: DayInfo[] = [
  { id: "mon", label: "Thứ 2", short: "T2", tableLabel: "Thứ 2" },
  { id: "tue", label: "Thứ 3", short: "T3", tableLabel: "Thứ 3" },
  { id: "wed", label: "Thứ 4", short: "T4", tableLabel: "Thứ 4" },
  { id: "thu", label: "Thứ 5", short: "T5", tableLabel: "Thứ 5" },
  { id: "fri", label: "Thứ 6", short: "T6", tableLabel: "Thứ 6" },
  { id: "sat", label: "Thứ 7", short: "T7", tableLabel: "Thứ 7" },
  { id: "sun", label: "Chủ nhật", short: "CN", tableLabel: "CN" },
];

export const sessions: SessionInfo[] = [
  { id: "morning", label: "Sáng", icon: "☀️" },
  { id: "afternoon", label: "Chiều", icon: "🌤️" },
  { id: "evening", label: "Tối", icon: "🌙" },
];

export const defaultPeriods: Record<string, number> = {
  morning: 5,
  afternoon: 4,
  evening: 3,
};

export const subjectPresets = [
  { name: "Toán", abbr: "TOÁN" },
  { name: "Vật lý", abbr: "LÝ" },
  { name: "Hóa học", abbr: "HÓA" },
  { name: "Ngữ văn", abbr: "VĂN" },
  { name: "Tiếng Anh", abbr: "ANH" },
  { name: "Lịch sử", abbr: "SỬ" },
  { name: "Địa lý", abbr: "ĐỊA" },
  { name: "Sinh học", abbr: "SINH" },
  { name: "GDCD", abbr: "GDCD" },
  { name: "Thể dục", abbr: "TD" },
  { name: "Âm nhạc", abbr: "AM" },
  { name: "Mỹ thuật", abbr: "MT" },
  { name: "Công nghệ", abbr: "CN" },
  { name: "Tin học", abbr: "TIN" },
  { name: "Tự nhiên-Xã hội", abbr: "TN-XH" },
];

export const classPresetGroups = [
  {
    label: "Khối 6",
    classes: ["6A", "6B", "6C", "6D", "6E"],
  },
  {
    label: "Khối 7",
    classes: ["7A", "7B", "7C", "7D", "7E"],
  },
  {
    label: "Khối 8",
    classes: ["8A", "8B", "8C", "8D", "8E"],
  },
  {
    label: "Khối 9",
    classes: ["9A", "9B", "9C", "9D", "9E"],
  },
];

export const teacherColors = [
  { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/40" },
  { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/40" },
  { bg: "bg-teal-500/20", text: "text-teal-400", border: "border-teal-500/40" },
  { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/40" },
  { bg: "bg-sky-500/20", text: "text-sky-400", border: "border-sky-500/40" },
  { bg: "bg-violet-500/20", text: "text-violet-400", border: "border-violet-500/40" },
  { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/40" },
  { bg: "bg-pink-500/20", text: "text-pink-400", border: "border-pink-500/40" },
  { bg: "bg-rose-500/20", text: "text-rose-400", border: "border-rose-500/40" },
  { bg: "bg-orange-500/20", text: "text-orange-400", border: "border-orange-500/40" },
  { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/40" },
  { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/40" },
  { bg: "bg-lime-500/20", text: "text-lime-400", border: "border-lime-500/40" },
  { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/40" },
  { bg: "bg-fuchsia-500/20", text: "text-fuchsia-400", border: "border-fuchsia-500/40" },
  { bg: "bg-emerald-600/20", text: "text-emerald-300", border: "border-emerald-600/40" },
];

export const constraintTypeList = [
  { id: "required" as const, label: "Bắt buộc" },
  { id: "preferred" as const, label: "Nên có" },
];

// CSS class constants
export const panelClass =
  "bg-[#141414] border border-white/[0.06] rounded-xl p-4 sm:p-6";

export const panelMutedClass =
  "bg-[#141414]/60 border border-white/[0.04] rounded-xl p-4 sm:p-6";

export const iconShellClass =
  "w-10 h-10 rounded-lg bg-[#1a1a1a] border border-white/[0.06] flex items-center justify-center text-white/60";

export const inputClass =
  "w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#4DB848]/50 focus:ring-1 focus:ring-[#4DB848]/30 transition-colors";

export const primaryButtonClass =
  "px-5 py-2.5 bg-[#4DB848] hover:bg-[#3da33d] text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#4DB848]";

export const disabledPrimaryButtonClass =
  "px-5 py-2.5 bg-[#4DB848]/40 text-white/50 font-medium rounded-lg text-sm cursor-not-allowed";

export const ghostButtonClass =
  "px-5 py-2.5 bg-transparent hover:bg-white/[0.06] text-white/70 hover:text-white font-medium rounded-lg text-sm transition-colors";

export const navBarClass =
  "sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/[0.06] px-4 sm:px-6 py-3 flex items-center justify-between";

export const navBackClass =
  "flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors";

export const navNextClass =
  "px-4 py-2 bg-[#4DB848] hover:bg-[#3da33d] text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export const navDisabledClass =
  "px-4 py-2 bg-[#4DB848]/40 text-white/50 font-medium rounded-lg text-sm cursor-not-allowed";

// Wizard page order
export const wizardPages = [
  "select",
  "periods",
  "final",
  "details",
  "subjects",
  "classes",
  "assignments",
  "constraints",
  "result",
] as const;

// Solve progress steps
export const solveProgressSteps = [
  "Đang phân tích ràng buộc...",
  "Đang định nghĩa bài toán...",
  "Đang tạo code OR-Tools...",
  "Đang giải bài toán...",
  "Đang xác minh kết quả...",
  "Đang tạo báo cáo...",
];
