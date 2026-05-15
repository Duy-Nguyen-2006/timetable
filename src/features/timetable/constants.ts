import { Moon, Sun, Sunrise } from 'lucide-react'

export const days = [
  { id: 'monday', label: 'Thứ hai', short: 'T2', tableLabel: 'Thứ 2' },
  { id: 'tuesday', label: 'Thứ ba', short: 'T3', tableLabel: 'Thứ 3' },
  { id: 'wednesday', label: 'Thứ tư', short: 'T4', tableLabel: 'Thứ 4' },
  { id: 'thursday', label: 'Thứ năm', short: 'T5', tableLabel: 'Thứ 5' },
  { id: 'friday', label: 'Thứ sáu', short: 'T6', tableLabel: 'Thứ 6' },
  { id: 'saturday', label: 'Thứ bảy', short: 'T7', tableLabel: 'Thứ 7' },
  { id: 'sunday', label: 'Chủ nhật', short: 'CN', tableLabel: 'CN' },
] as const

export const sessions = [
  { id: 'morning', label: 'Sáng', icon: '🌤️', periodIcon: Sunrise },
  { id: 'afternoon', label: 'Chiều', icon: '☀️', periodIcon: Sun },
  { id: 'night', label: 'Tối', icon: '🌙', periodIcon: Moon },
] as const

export const defaultPeriods = {
  morning: 4,
  afternoon: 4,
  night: 3,
} as const

export const classPresetGroups = [
  { label: '6A-D', classes: ['6A', '6B', '6C', '6D'] },
  { label: '7A-D', classes: ['7A', '7B', '7C', '7D'] },
  { label: '8A-D', classes: ['8A', '8B', '8C', '8D'] },
  { label: '9A-D', classes: ['9A', '9B', '9C', '9D'] },
] as const

export const subjectPresets = [
  { label: 'Văn', value: 'Văn' },
  { label: 'Toán', value: 'Toán' },
  { label: 'Tiếng Anh', value: 'Tiếng Anh' },
  { label: 'Giáo dục công dân', value: 'GDCD' },
  { label: 'Lịch sử và Địa lí', value: 'LS&ĐL' },
  { label: 'Khoa học tự nhiên', value: 'KHTN' },
  { label: 'Công nghệ', value: 'CN' },
  { label: 'Tin học', value: 'Tin' },
  { label: 'Giáo dục thể chất', value: 'GDTC' },
  { label: 'Nghệ thuật 1 - Âm nhạc', value: 'NT 1' },
  { label: 'Nghệ thuật 2 - Mỹ thuật', value: 'NT 2' },
  { label: 'Hoạt động trải nghiệm, hướng nghiệp', value: 'HĐTN' },
  { label: 'Nội dung giáo dục của địa phương', value: 'GDĐP' },
] as const

export const teacherColors = [
  { border: 'rgba(255,255,255,0.06)', bg: '#141414', text: '#4DB848', softText: '#ffffff80' },
  { border: 'rgba(255,255,255,0.06)', bg: '#141414', text: '#7dd3fc', softText: '#ffffff80' },
  { border: 'rgba(255,255,255,0.06)', bg: '#141414', text: '#a78bfa', softText: '#ffffff80' },
  { border: 'rgba(255,255,255,0.06)', bg: '#141414', text: '#fb923c', softText: '#ffffff80' },
] as const

export const panelClass = 'rounded-md border border-white/[0.06] bg-[#141414]'
export const panelMutedClass = 'rounded-md border border-white/[0.06] bg-[#111]'
export const inputClass = 'h-10 w-full rounded-md border border-white/[0.08] bg-[#0a0a0a] px-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20'
export const iconShellClass = 'flex h-8 w-8 items-center justify-center rounded border border-white/[0.06] text-white/50'
export const navBarClass = 'flex w-full items-center justify-between py-4'
export const navBackClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/[0.08] bg-transparent px-5 text-sm text-white/70 transition hover:bg-white/[0.04] hover:text-white'
export const navNextClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#4DB848] px-5 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#40993C]'
export const navDisabledClass = 'disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30 disabled:border-white/[0.04]'
export const ghostButtonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-white/[0.08] bg-transparent px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.04] hover:text-white'
export const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-md bg-[#4DB848] px-4 py-2 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#40993C]'
export const disabledPrimaryButtonClass = 'disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/30 disabled:border-white/[0.04]'

export const constraintTypes = {
  required: {
    id: 'required',
    label: 'Bắt buộc',
    description: 'Ràng buộc cứng khi sắp xếp thời khóa biểu',
    color: 'red',
    boxClass: 'border-red-500/30 bg-red-500/[0.06] text-white',
    iconClass: 'text-red-400',
    badgeClass: 'border-red-500/30 bg-red-500/10 text-red-400',
  },
  preferred: {
    id: 'preferred',
    label: 'Nên có',
    description: 'Ràng buộc ưu tiên, có thể linh hoạt khi cần',
    color: 'green',
    boxClass: 'border-green-500/30 bg-green-500/[0.06] text-white',
    iconClass: 'text-green-400',
    badgeClass: 'border-green-500/30 bg-green-500/10 text-green-400',
  },
} as const

export const constraintTypeList = Object.values(constraintTypes)
