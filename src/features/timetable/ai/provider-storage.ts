import type { AIProviderConfig } from './types'

export const AI_PROVIDER_STORAGE_KEY = 'tack_ai_provider_config'

type SecureStoreBridge = {
  isAvailable?: () => Promise<boolean>
  saveProvider?: (cfg: AIProviderConfig) => Promise<{ encrypted?: boolean }>
  loadProvider?: () => Promise<AIProviderConfig | null>
  clearProvider?: () => Promise<unknown>
}

function bridge(): SecureStoreBridge | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { electron?: { secureStore?: SecureStoreBridge } }
  return w.electron?.secureStore ?? null
}

export const encodeProviderConfig = (config: AIProviderConfig) =>
  btoa(unescape(encodeURIComponent(JSON.stringify(config))))

export const decodeProviderConfig = (raw: string): AIProviderConfig => {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(raw)))) as AIProviderConfig
  } catch {
    return JSON.parse(raw) as AIProviderConfig
  }
}

export async function persistProviderConfig(config: AIProviderConfig): Promise<{ secure: boolean }> {
  const b = bridge()
  if (b?.saveProvider) {
    try {
      const result = (await b.saveProvider(config)) ?? {}
      try {
        window.localStorage.removeItem(AI_PROVIDER_STORAGE_KEY)
      } catch {
        /* non-browser env */
      }
      return { secure: Boolean(result.encrypted) }
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('persistProviderConfig: secure save failed, falling back to localStorage', err)
    }
  }
  try {
    window.localStorage.setItem(AI_PROVIDER_STORAGE_KEY, encodeProviderConfig(config))
  } catch {
    /* ignore */
  }
  return { secure: false }
}

export async function loadProviderConfig(): Promise<AIProviderConfig | null> {
  const b = bridge()
  if (b?.loadProvider) {
    try {
      const cfg = await b.loadProvider()
      if (cfg) return cfg
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('loadProviderConfig: secure load failed, falling back to localStorage', err)
    }
  }
  try {
    const raw = window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY)
    if (!raw) return null
    return decodeProviderConfig(raw)
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('loadProviderConfig: localStorage decode failed', err)
    return null
  }
}

export async function clearProviderConfig(): Promise<void> {
  const b = bridge()
  if (b?.clearProvider) {
    try {
      await b.clearProvider()
    } catch {
      /* ignore */
    }
  }
  try {
    window.localStorage.removeItem(AI_PROVIDER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export async function isSecureStorageAvailable(): Promise<boolean> {
  const b = bridge()
  if (!b?.isAvailable) return false
  try {
    return Boolean(await b.isAvailable())
  } catch {
    return false
  }
}
