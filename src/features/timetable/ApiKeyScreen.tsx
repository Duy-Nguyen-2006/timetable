'use client'

import { useState } from 'react'
import { Key, Loader2, AlertCircle, CheckCircle2, Zap } from 'lucide-react'

import { useApiKeyStore, formatTokenCount } from './ai/api-key-store'
import {
  panelClass,
  inputClass,
  primaryButtonClass,
  disabledPrimaryButtonClass,
  iconShellClass,
} from './constants'

type ApiKeyScreenProps = {
  onSuccess: () => void
}

export default function ApiKeyScreen({ onSuccess }: ApiKeyScreenProps) {
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const { setApiKey, modelPolicy } = useApiKeyStore()

  const handleActivate = async () => {
    const trimmedKey = keyInput.trim()
    if (!trimmedKey) {
      setError('Vui lòng nhập API key')
      return
    }

    if (!trimmedKey.startsWith('lpr_')) {
      setError('API key phải bắt đầu bằng "lpr_"')
      return
    }

    setError(null)
    setIsValidating(true)

    try {
      const result = await fetch('/api/model-policy', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'x-api-key': trimmedKey,
          'x-lowprizo-api-key': trimmedKey,
        },
      })

      if (!result.ok) {
        if (result.status === 401) {
          setError('API key không hợp lệ. Vui lòng kiểm tra lại.')
        } else {
          setError(`Lỗi xác thực (${result.status}). Vui lòng thử lại sau.`)
        }
        setIsValidating(false)
        return
      }

      const data = await result.json()
      setApiKey(trimmedKey)

      setShowSuccess(true)
      setIsValidating(false)

      // Brief success animation then transition
      setTimeout(() => {
        onSuccess()
      }, 1200)
    } catch {
      setError('Không thể kết nối đến máy chủ. Vui lòng thử lại.')
      setIsValidating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isValidating) {
      e.preventDefault()
      handleActivate()
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#050505] px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(77,184,72,0.10),transparent_42%)]" />

      <div className="relative flex w-full max-w-md flex-col items-center">
        {/* Icon */}
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.06] bg-[#141414]">
          {showSuccess ? (
            <CheckCircle2 size={40} className="text-[#4DB848]" strokeWidth={1.5} />
          ) : (
            <Key size={36} className="text-[#4DB848]" strokeWidth={1.5} />
          )}
        </div>

        {/* Title */}
        <h1 className="text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {showSuccess ? 'Kích hoạt thành công!' : 'Kích hoạt Tack'}
        </h1>

        {showSuccess ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <p className="text-center text-sm text-white/50">
              Đang chuyển đến ứng dụng...
            </p>
            <Loader2 size={20} className="animate-spin text-[#4DB848]" />
          </div>
        ) : (
          <>
            <p className="mt-4 max-w-sm text-center text-sm leading-7 text-white/40">
              Nhập API key để kích hoạt các tính năng AI. Tạo key tại{' '}
              <a
                href="https://lowprizo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4DB848] underline decoration-[#4DB848]/30 underline-offset-2 hover:decoration-[#4DB848]/60"
              >
                lowprizo.com
              </a>
            </p>

            {/* Card */}
            <div className={`${panelClass} mt-8 w-full p-6`}>
              <div className="mb-4 flex items-center gap-2.5">
                <span className={iconShellClass}>
                  <Zap size={16} strokeWidth={1.5} />
                </span>
                <div>
                  <p className="text-sm font-medium text-white">API Key</p>
                  <p className="text-xs text-white/40">Bắt đầu bằng lpr_...</p>
                </div>
              </div>

              <input
                type="password"
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value)
                  setError(null)
                }}
                onKeyDown={handleKeyDown}
                placeholder="lpr_..."
                disabled={isValidating}
                className={inputClass}
                autoFocus
              />

              {error && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" strokeWidth={1.5} />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleActivate}
                disabled={isValidating || !keyInput.trim()}
                className={`${primaryButtonClass} ${disabledPrimaryButtonClass} mt-4 w-full`}
              >
                {isValidating ? (
                  <>
                    <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                    Đang xác thực...
                  </>
                ) : (
                  <>
                    <Zap size={14} strokeWidth={1.5} />
                    Kích hoạt
                  </>
                )}
              </button>
            </div>

            {/* Info text */}
            <p className="mt-6 text-center text-[11px] uppercase tracking-widest text-white/20">
              Key được lưu trữ cục bộ trên thiết bị của bạn
            </p>
          </>
        )}
      </div>
    </main>
  )
}
