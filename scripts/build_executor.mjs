// Build the `code_executor` PyInstaller binary for the current platform (#4/#5).
// Output goes to python-dist/<platform>/ and is mirrored to python-dist/ so the
// dev path (electron/../python-dist) and electron-builder extraResources both work.
//
// Usage: node scripts/build_executor.mjs
// Requires: a Python env with pyinstaller + ortools installed.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const entry = path.join(root, 'python', 'code_executor.py')
const distRoot = path.join(root, 'python-dist')
const workDir = path.join(root, '.pyinstaller-build')
const binaryName = process.platform === 'win32' ? 'code_executor.exe' : 'code_executor'

function fail(message) {
  console.error(`[build_executor] ${message}`)
  process.exit(1)
}

if (!existsSync(entry)) fail(`Missing entrypoint: ${entry}`)

const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')

// Verify pyinstaller is importable in the chosen interpreter.
const check = spawnSync(python, ['-m', 'PyInstaller', '--version'], { encoding: 'utf8' })
if (check.status !== 0) {
  fail(
    `PyInstaller not available for "${python}". Install with: ${python} -m pip install pyinstaller ortools`
  )
}
console.log(`[build_executor] PyInstaller ${String(check.stdout).trim()} via ${python}`)

const sep = process.platform === 'win32' ? ';' : ':'
// Bundle the python sources the executor imports at runtime (sandbox/, templates).
const addData = [
  `${path.join(root, 'sandbox')}${sep}sandbox`,
  `${path.join(root, 'python', 'validator_engine.py')}${sep}.`,
  `${path.join(root, 'python', 'templates')}${sep}templates`,
]

const hiddenImports = [
  'ortools',
  'ortools.sat.python.cp_model',
]

const args = [
  '-m', 'PyInstaller',
  '--onefile',
  '--name', 'code_executor',
  '--distpath', path.join(distRoot, process.platform),
  '--workpath', workDir,
  '--specpath', workDir,
  '--clean',
  '--noconfirm',
  ...addData.flatMap((d) => ['--add-data', d]),
  ...hiddenImports.flatMap((h) => ['--hidden-import', h]),
  '--collect-all', 'ortools',
  entry,
]

console.log(`[build_executor] Building ${binaryName} for ${process.platform}/${process.arch}...`)
const build = spawnSync(python, args, { stdio: 'inherit' })
if (build.status !== 0) fail('PyInstaller build failed.')

const builtBinary = path.join(distRoot, process.platform, binaryName)
if (!existsSync(builtBinary)) fail(`Build reported success but binary not found: ${builtBinary}`)

// Mirror to python-dist/<binaryName> so the dev launcher (electron/../python-dist) finds it.
mkdirSync(distRoot, { recursive: true })
copyFileSync(builtBinary, path.join(distRoot, binaryName))

// Clean intermediate build dir to keep the tree tidy.
try {
  rmSync(workDir, { recursive: true, force: true })
} catch {
  /* ignore */
}

console.log(`[build_executor] Done: ${builtBinary}`)
console.log(`[build_executor] Mirrored to: ${path.join(distRoot, binaryName)}`)
