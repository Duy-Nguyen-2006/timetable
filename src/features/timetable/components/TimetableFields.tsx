import { useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Minus, Plus } from 'lucide-react'
import { iconShellClass, inputClass, panelClass, panelMutedClass } from '../constants'

export function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={`${panelMutedClass} p-3`}>
      <p className="text-[10px] uppercase tracking-widest text-white/35">{label}</p>
      <div className="mt-1 text-sm text-white/70">{value}</div>
    </div>
  )
}

type SelectFieldProps = {
  icon: LucideIcon
  label: string
  placeholder: string
  value: string
  options: string[]
  onChange: (value: string) => void
}

export function SelectField({ icon: Icon, label, placeholder, value, options, onChange }: SelectFieldProps) {
  return (
    <label className={`${panelClass} block p-4`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={iconShellClass}>
          <Icon size={16} strokeWidth={1.5} />
        </span>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

type DayTileProps = {
  selected: boolean
  title: string
  subtitle: string
  onClick: () => void
}

export function DayTile({ selected, title, subtitle, onClick }: DayTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center justify-center rounded-md px-2 py-3 transition-all duration-200 ${
        selected
          ? 'bg-[#4DB848] text-[#0a0a0a]'
          : 'border border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <span className={`text-sm font-semibold leading-none ${selected ? 'text-[#0a0a0a]' : 'text-white'}`}>{subtitle}</span>
      <span className={`mt-1 text-[10px] leading-none ${selected ? 'text-[#0a0a0a]/50' : 'text-white/30'}`}>{title.replace('Thứ ', '')}</span>
    </button>
  )
}

type SessionTileProps = {
  selected: boolean
  icon: ReactNode
  title: string
  onClick: () => void
}

export function SessionTile({ selected, icon, title, onClick }: SessionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center justify-center gap-2 rounded-md px-4 py-4 transition-all duration-200 ${
        selected
          ? 'bg-[#4DB848] text-[#0a0a0a]'
          : 'border border-white/[0.06] bg-[#141414] text-white hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
          selected
            ? 'border-[#0a0a0a]/10 bg-[#0a0a0a]/10 text-[#0a0a0a]'
            : 'border-white/[0.08] bg-white/[0.03] text-[#4DB848] group-hover:bg-white/[0.06]'
        }`}
      >
        <span className="text-xl">{icon}</span>
      </span>
      <span className={`text-sm font-semibold ${selected ? 'text-[#0a0a0a]' : 'text-white'}`}>{title}</span>
    </button>
  )
}

type PeriodControlProps = {
  session: { id: string; label: string; icon: ReactNode }
  value: number
  onChange: (sessionId: string, value: number) => void
}

export function PeriodControl({ session, value, onChange }: PeriodControlProps) {
  const [rawInput, setRawInput] = useState<string | null>(null)

  const clampValue = (nextValue) => Math.min(12, Math.max(1, nextValue))
  const displayValue = rawInput ?? String(value)
  const parsedRawValue = rawInput === null || rawInput === '' ? null : Number(rawInput)
  const isInvalid =
    rawInput !== null &&
    (rawInput === '' ||
      parsedRawValue === null ||
      Number.isNaN(parsedRawValue) ||
      parsedRawValue < 1 ||
      parsedRawValue > 12 ||
      !Number.isInteger(parsedRawValue))

  const commitValue = (nextValue) => {
    const cleanValue = Number.isNaN(nextValue) ? value : clampValue(nextValue)
    onChange(session.id, cleanValue)
    setRawInput(null)
  }

  const handleInputChange = (event) => {
    const raw = event.target.value
    setRawInput(raw)

    if (raw === '') {
      return
    }

    const num = Number(raw)
    if (!Number.isNaN(num) && num >= 1 && num <= 12 && Number.isInteger(num)) {
      onChange(session.id, num)
    }
  }

  const handleBlur = () => {
    if (rawInput === null) {
      return
    }

    if (isInvalid) {
      setRawInput(null)
      return
    }

    commitValue(Number(rawInput))
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleBlur()
    }
  }

  const handleStep = (delta) => {
    const baseValue = rawInput !== null && !isInvalid && rawInput !== '' ? Number(rawInput) : value
    commitValue(baseValue + delta)
  }

  return (
    <div className={`${panelClass} p-4`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[#4DB848] transition">
            <span className="text-xl">{session.icon}</span>
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{session.label}</p>
            <p className="text-xs text-white/40">Số tiết tối đa cho buổi này</p>
          </div>
        </div>

        <div className={`${panelMutedClass} flex items-center gap-2 p-1.5`}>
          <button
            type="button"
            onClick={() => handleStep(-1)}
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] bg-transparent text-white/50 transition hover:bg-white/[0.04]"
            aria-label={`Giảm số tiết buổi ${session.label}`}
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <label className="sr-only" htmlFor={`${session.id}-periods`}>
            Số tiết tối đa buổi {session.label}
          </label>
          <input
            id={`${session.id}-periods`}
            type="number"
            min="1"
            max="12"
            value={displayValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={`h-8 w-16 rounded border text-center text-sm outline-none transition ${
              isInvalid
                ? 'border-red-500/60 bg-red-500/[0.06] text-red-400 focus:border-red-400'
                : 'border-white/[0.08] bg-[#0a0a0a] text-white focus:border-white/20'
            }`}
          />
          <button
            type="button"
            onClick={() => handleStep(1)}
            className="flex h-8 w-8 items-center justify-center rounded border border-white/[0.08] bg-transparent text-white/50 transition hover:bg-white/[0.04]"
            aria-label={`Tăng số tiết buổi ${session.label}`}
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}

type InfoFieldProps = {
  icon: LucideIcon
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}

export function InfoField({ icon: Icon, label, placeholder, value, onChange }: InfoFieldProps) {
  return (
    <label className={`${panelClass} block p-4`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={iconShellClass}>
          <Icon size={16} strokeWidth={1.5} />
        </span>
        <span className="text-sm font-medium text-white">{label}</span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  )
}
