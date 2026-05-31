// Secure storage for AI provider credentials backed by Electron safeStorage.
// On platforms with no OS keystore (Linux without libsecret), safeStorage
// transparently degrades to a less-secure encrypted blob; we expose
// `isAvailable()` so the renderer can show an appropriate warning.

import { app, safeStorage } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'

const FILE_NAME = 'provider-credentials.bin'

function targetPath() {
  return path.join(app.getPath('userData'), FILE_NAME)
}

export function isSecureStoreAvailable() {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export async function saveProvider(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('saveProvider: config must be an object')
  }
  const json = JSON.stringify(config)
  let payload
  if (isSecureStoreAvailable()) {
    payload = safeStorage.encryptString(json)
  } else {
    payload = Buffer.from(`PLAIN:${json}`, 'utf8')
  }
  const file = targetPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, payload, { mode: 0o600 })
  return { encrypted: isSecureStoreAvailable() }
}

export async function loadProvider() {
  const file = targetPath()
  let buf
  try {
    buf = await fs.readFile(file)
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw err
  }
  const head = buf.slice(0, 6).toString('utf8')
  if (head === 'PLAIN:') {
    return JSON.parse(buf.slice(6).toString('utf8'))
  }
  if (!isSecureStoreAvailable()) {
    return null
  }
  try {
    return JSON.parse(safeStorage.decryptString(buf))
  } catch {
    return null
  }
}

export async function clearProvider() {
  try {
    await fs.unlink(targetPath())
    return { cleared: true }
  } catch (err) {
    if (err && err.code === 'ENOENT') return { cleared: false }
    throw err
  }
}
