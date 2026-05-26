/**
 * Focused test on the two previously failing datasets (DS2 + DS5)
 * after adding: richer feedback + attempt memory tool + incremental editing prompt.
 *
 * Run with: bun scripts/test-hard-datasets.ts
 */

import { runLowprizoDirectAgent } from '../src/lib/lowprizo-direct-agent'
import fs from 'fs'

const key = fs.readFileSync('keytest.txt', 'utf8').trim()
const payloads = JSON.parse(fs.readFileSync('/tmp/all-datasets-payloads.json', 'utf8'))

async function testDataset(id: number) {
  console.log('\n' + '='.repeat(70))
  console.log(`TESTING DATASET ${id} (with new memory + rich feedback)`)
  console.log('='.repeat(70))

  const payload = payloads[id]
  payload.apiKey = key

  let toolCalls = 0
  let historyReads = 0
  let lastMessage = ''

  const result = await runLowprizoDirectAgent(payload, {
    apiKey: key,
    strategy: 'native-tools',
    maxTurns: 22,
    debug: true,
    onProgress: (event) => {
      if (event.type === 'pi_coder_debug' && event.message?.startsWith('Tool:')) {
        toolCalls++
        if (event.message.includes('read_attempt_history')) historyReads++
      }
      if (event.type === 'result' && event.data) {
        lastMessage = event.data.message
      }
    },
  })

  const cells = result.cells?.length || 0
  const hardOk = (result.diagnostics || []).some((d: string) =>
    d.toLowerCase().includes('hard') && d.toLowerCase().includes('satisf')
  ) || result.status === 'solved'

  console.log(`\n--- FINAL RESULT DS${id} ---`)
  console.log(`Status          : ${result.status}`)
  console.log(`Cells           : ${cells}`)
  console.log(`Hard satisfied  : ${hardOk}`)
  console.log(`Tool calls      : ${toolCalls}`)
  console.log(`Used history tool: ${historyReads > 0}`)
  console.log(`Message         : ${result.message}`)
  console.log(`Last diagnostics: ${(result.diagnostics || []).slice(0, 3).join(' | ')}`)

  return { id, cells, hardOk, toolCalls, historyReads, success: cells > 0 && hardOk }
}

async function main() {
  console.log('=== FOCUSED TEST: DS2 + DS5 after 3 major improvements ===')
  console.log('Improvements applied:')
  console.log('1. Much richer run_python feedback (violations count + guidance)')
  console.log('2. New read_attempt_history tool + automatic attempt tracking')
  console.log('3. Stronger prompt for incremental work + using memory')

  const results = []
  results.push(await testDataset(2))
  results.push(await testDataset(5))

  console.log('\n' + '='.repeat(70))
  console.log('SUMMARY (DS2 + DS5)')
  console.log('='.repeat(70))
  results.forEach(r => {
    const status = r.success ? '✅ SUCCESS' : '❌ STILL FAILING'
    console.log(`DS${r.id}: ${status} | cells=${r.cells} | hardOK=${r.hardOk} | tools=${r.toolCalls} | usedHistory=${r.historyReads > 0}`)
  })

  const improved = results.filter(r => r.success).length
  console.log(`\nImprovement on hard datasets: ${improved}/2 now succeed`)
}

main().catch(console.error)
