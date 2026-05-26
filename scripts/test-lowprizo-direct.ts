/**
 * Rapid test script for Lowprizo Direct Agent experiments.
 * Usage: bun scripts/test-lowprizo-direct.ts
 */

import path from 'path'
import { runLowprizoDirectAgent } from '../src/lib/lowprizo-direct-agent'
import type { SolverRequestPayload } from '../src/features/timetable/ai/types'

const fs = require('fs')
const key = fs.readFileSync(path.join(__dirname, '..', 'keytest.txt'), 'utf8').trim()

console.log('Using key:', key.slice(0, 12) + '...')

const testPayload: SolverRequestPayload = {
  apiKey: key,
  engine: 'pi-agent',
  debug: true,

  days: [
    { id: 'd1', label: 'Thứ 2' },
    { id: 'd2', label: 'Thứ 3' },
    { id: 'd3', label: 'Thứ 4' },
    { id: 'd4', label: 'Thứ 5' },
    { id: 'd5', label: 'Thứ 6' },
  ],
  sessions: [
    { id: 's1', label: 'Sáng' },
    { id: 's2', label: 'Chiều' },
  ],
  periodCounts: { s1: 5, s2: 4 },

  deletedPeriods: {},

  assignments: [
    { id: 'a1', teacher: { id: 'gv1', label: 'Cô Hương' }, subject: { id: 'toan', label: 'Toán' }, class: { id: 'lop6a', label: '6A' }, weeklyPeriods: 5 },
    { id: 'a2', teacher: { id: 'gv2', label: 'Thầy Minh' }, subject: { id: 'ly', label: 'Lý' }, class: { id: 'lop6a', label: '6A' }, weeklyPeriods: 4 },
    { id: 'a3', teacher: { id: 'gv1', label: 'Cô Hương' }, subject: { id: 'toan', label: 'Toán' }, class: { id: 'lop7b', label: '7B' }, weeklyPeriods: 5 },
    { id: 'a4', teacher: { id: 'gv3', label: 'Cô Lan' }, subject: { id: 'hoa', label: 'Hóa' }, class: { id: 'lop7b', label: '7B' }, weeklyPeriods: 3 },
  ],

  constraints: [
    { type: 'required', text: 'Cô Hương không dạy tiết 1 buổi sáng' },
    { type: 'preferred', text: 'Thầy Minh dạy nhiều vào buổi sáng', weight: 8 },
  ],
}

async function main() {
  console.log('\n=== Starting Lowprizo Direct Agent Test ===\n')

  const events: any[] = []

  const result = await runLowprizoDirectAgent(testPayload, {
    apiKey: key,
    // Force native tool calling now that we know the server supports it
    // (the previous 403s were caused by the OpenAI SDK's default headers)
    strategy: 'native-tools',
    debug: true,
    maxTurns: 20,
    onProgress: (event) => {
      events.push(event)
      if (event.type === 'pi_coder_debug' || event.type.includes('sandbox') || event.type.includes('result')) {
        console.log('EVENT:', JSON.stringify(event, null, 2).slice(0, 600))
      }
    },
  })

  console.log('\n=== FINAL RESULT ===')
  console.log('Status:', result.status)
  console.log('Verdict:', result.verdict)
  console.log('Message:', result.message)
  console.log('Cells count:', result.cells?.length || 0)
  if (result.cells?.length) {
    console.log('Sample cells:', result.cells.slice(0, 3))
  }
  console.log('Diagnostics:', result.diagnostics)

  console.log('\nTotal events:', events.length)
}

main().catch(err => {
  console.error('Test crashed:', err)
  process.exit(1)
})
