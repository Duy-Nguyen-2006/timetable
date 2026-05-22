// Cross-platform post-build script: copies static/public into .next/standalone
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')

const standaloneDir = join(root, '.next', 'standalone')
const standaloneNextDir = join(standaloneDir, '.next')
const compiledDir = join(standaloneDir, 'node_modules', 'next', 'dist', 'compiled')

mkdirSync(standaloneNextDir, { recursive: true })
mkdirSync(compiledDir, { recursive: true })

const staticSrc = join(root, '.next', 'static')
const staticDst = join(standaloneNextDir, 'static')
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDst, { recursive: true, force: true })
  console.log('Copied .next/static → standalone/.next/static')
}

const publicSrc = join(root, 'public')
const publicDst = join(standaloneDir, 'public')
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDst, { recursive: true, force: true })
  console.log('Copied public → standalone/public')
}

const nextServerSrc = join(root, 'node_modules', 'next', 'dist', 'compiled', 'next-server')
const nextServerDst = join(compiledDir, 'next-server')
if (existsSync(nextServerSrc) && !existsSync(nextServerDst)) {
  cpSync(nextServerSrc, nextServerDst, { recursive: true })
  console.log('Copied next-server into standalone')
}

console.log('Post-build done.')
