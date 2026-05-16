'use client'

import { useEffect, useCallback } from 'react'
import { Settings, AlertTriangle } from 'lucide-react'

import { useApiKeyStore, formatTokenCount } from './ai/api-key-store'

type QuotaDisplayProps = {
  onSettingsClick: () => void
}

export default function QuotaDisplay({ onSettingsClick }: QuotaDisplayProps) {
  const { modelPolicy, fetchModelPolicy, isLoadingPolicy, apiKey } = useApiKeyStore()

  const refresh = useCallback(() => {
    if (apiKey) {
      fetchModelPolicy()
    }
  }, [apiKey, fetchModelPolicy])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!apiKey) return
    const interval = setInterval(refresh, 60_000)
    return () => clearInterval(interval)
  }, [apiKey, refresh])

  if (!modelPolicy) return null

  const { quota } = modelPolicy
  const isLowQuota = quota.remaining / quota.limit < 0.2

  return (
    <button
      type="button"
      onClick={onSettingsClick}
      className="group inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-[#141414] px-3 py-1.5 text-xs transition hover:border-white/[0.12] hover:bg-white/[0.04]"
      title="Nhấn để thay đổi API key"
    >
      {isLowQuota ? (
        <AlertTriangle size={12} className="text-amber-400" strokeWidth={1.5} />
      ) : (
        <div className="h-1.5 w-1.5 rounded-full bg-[#4DB848]" />
      )}
      <span className={`font-medium ${isLowQuota ? 'text-amber-400' : 'text-white/60'}`}>
        {formatTokenCount(quota.remaining)} / {formatTokenCount(quota.limit)}
      </span>
      <span className="text-white/25">tokens</span>
      <Settings size={11} className="text-white/20 transition group-hover:text-white/40" strokeWidth={1.5} />
    </button>
  )
}
