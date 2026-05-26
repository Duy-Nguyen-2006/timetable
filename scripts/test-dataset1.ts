/**
 * Real dataset test for the new direct agent.
 * Uses DATASET 1 from datasets.txt (smallest: 2 classes, morning only).
 *
 * Usage: bun scripts/test-dataset1.ts
 */

import { runLowprizoDirectAgent } from '../src/lib/lowprizo-direct-agent'
import type { SolverRequestPayload } from '../src/features/timetable/ai/types'
import fs from 'fs'
import path from 'path'

const key = fs.readFileSync(path.join(__dirname, '..', 'keytest.txt'), 'utf8').trim()
const payload: SolverRequestPayload = JSON.parse(
  fs.readFileSync('/tmp/dataset1-payload.json', 'utf8')
)
payload.apiKey = key

console.log('=== Testing with DATASET 1 (from datasets.txt) ===')
console.log('Teachers:', payload.assignments?.length)
console.log('Hard constraints:', payload.constraints?.filter(c => c.type === 'required').length)
console.log('Soft constraints:', payload.constraints?.filter(c => c.type === 'preferred').length)

async function main() {
  const events: any[] = []
  let toolCalls = 0
  let writes = 0
  let runs = 0
  let edits = 0

  const result = await runLowprizoDirectAgent(payload, {
    apiKey: key,
    strategy: 'native-tools',
    maxTurns: 25,
    debug: true,
    onProgress: (event) => {
      events.push(event)

      if (event.type === 'pi_coder_debug' && event.message?.startsWith('Tool:')) {
        toolCalls++
        const tool = event.message.replace('Tool: ', '')
        if (tool === 'write_file') writes++
        if (tool === 'run_python') runs++
        if (tool === 'edit_file') edits++
      }

      // Print important events
      if (['pi_coder_started', 'pi_coder_finished', 'sandbox_started', 'sandbox_finished', 'result'].includes(event.type) ||
          (event.type === 'pi_coder_debug' && event.message?.includes('Tool:'))) {
        console.log(`[${event.type}] ${event.message || JSON.stringify(event).slice(0, 120)}`)
      }
    },
  })

  console.log('\n=== FINAL RESULT ===')
  console.log('Status:', result.status)
  console.log('Verdict:', result.verdict)
  console.log('Message:', result.message)
  console.log('Cells count:', result.cells?.length || 0)
  console.log('Diagnostics:', result.diagnostics?.slice(0, 5))

  console.log('\n=== AGENT ACTIVITY SUMMARY ===')
  console.log(`Total tool calls observed: ${toolCalls}`)
  console.log(`  - write_file: ${writes}`)
  console.log(`  - run_python: ${runs}`)
  console.log(`  - edit_file:  ${edits}`)

  if (result.cells && result.cells.length > 0) {
    console.log('\nSample solution (first 5 cells):')
    console.log(JSON.stringify(result.cells.slice(0, 5), null, 2))
  }

  console.log('\nTotal events:', events.length)
}

main().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
