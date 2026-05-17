'use client'

import { create } from 'zustand'

export type ModelPolicy = {
  allowed_models: string[]
  default_model: string
  quota: {
    limit: number
    used: number
    remaining: number
    resets_at: string
  }
  user: {
    name: string
    status: string
  }
}

type ApiKeyState = {
  apiKey: string | null
  modelPolicy: ModelPolicy | null
  isLoadingPolicy: boolean
  policyError: string | null
  setApiKey: (key: string | null) => void
  fetchModelPolicy: (key?: string) => Promise<ModelPolicy | null>
  clearApiKey: () => void
}

const STORAGE_KEY = 'lowprizo_api_key'

function getStoredApiKey(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function storeApiKey(key: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (key) {
      localStorage.setItem(STORAGE_KEY, key)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // localStorage not available
  }
}

/**
 * Initialize store with API key from localStorage.
 * On the server, this returns null. On the client, it reads from localStorage.
 */
function getInitialApiKey(): string | null {
  return getStoredApiKey()
}

export const useApiKeyStore = create<ApiKeyState>((set, get) => ({
  apiKey: getInitialApiKey(),
  modelPolicy: null,
  isLoadingPolicy: false,
  policyError: null,

  setApiKey: (key: string | null) => {
    storeApiKey(key)
    set({ apiKey: key, policyError: null })
    if (key) {
      get().fetchModelPolicy(key)
    } else {
      set({ modelPolicy: null })
    }
  },

  fetchModelPolicy: async (key?: string) => {
    const apiKey = key ?? get().apiKey
    if (!apiKey) {
      set({ modelPolicy: null, policyError: 'Chưa nhập API key' })
      return null
    }

    set({ isLoadingPolicy: true, policyError: null })

    try {
      const response = await fetch('/api/model-policy', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'x-api-key': apiKey,
          'x-lowprizo-api-key': apiKey,
        },
      })

      if (!response.ok) {
        const errorText = response.status === 401 ? 'API key không hợp lệ' : `Lỗi ${response.status}`
        set({ isLoadingPolicy: false, policyError: errorText, modelPolicy: null })
        return null
      }

      const data: ModelPolicy = await response.json()
      set({ isLoadingPolicy: false, modelPolicy: data, policyError: null })
      return data
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể kết nối đến máy chủ'
      set({ isLoadingPolicy: false, policyError: message, modelPolicy: null })
      return null
    }
  },

  clearApiKey: () => {
    storeApiKey(null)
    set({ apiKey: null, modelPolicy: null, policyError: null })
  },
}))

/**
 * Hydrate the store from localStorage on client mount.
 * Needed because Zustand SSR may not match client localStorage.
 * Call this once in a useEffect or at module scope on the client.
 */
export function hydrateApiKeyFromStorage() {
  const stored = getStoredApiKey()
  const current = useApiKeyStore.getState().apiKey
  if (stored && stored !== current) {
    useApiKeyStore.getState().setApiKey(stored)
  } else if (stored) {
    // Already set, but ensure model policy is fetched
    const state = useApiKeyStore.getState()
    if (!state.modelPolicy && !state.isLoadingPolicy) {
      state.fetchModelPolicy(stored)
    }
  }
}

/**
 * Format large token numbers nicely: 50000000 -> "50M"
 */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
  }
  if (n >= 1_000) {
    const k = n / 1_000
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`
  }
  return String(n)
}
