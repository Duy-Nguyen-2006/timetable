/**
 * Full test suite: Run the direct Lowprizo agent on ALL datasets from datasets.txt
 * Using only devstral-latest.
 *
 * Usage: bun scripts/test-all-datasets.ts
 */

import { runLowprizoDirectAgent } from '../src/lib/lowprizo-direct-agent'
import type { SolverRequestPayload } from '../src/features/timetable/ai/types'
import fs from 'fs'
import path from 'path'

const key = fs.readFileSync(path.join(__dirname, '..', 'keytest.txt'), 'utf8').trim()
const allPayloads: Record<string, SolverRequestPayload> = JSON.parse(
  fs.readFileSync('/tmp/all-datasets-payloads.json', 'utf8')
)

interface DatasetResult {
  id: number
  success: boolean
  cells: number
  hardConstraintsSatisfied: boolean
  message: string
  turnsUsed: number
  toolCalls: number
  error?: string
}

async function testDataset(id: number, attempt: number = 1): Promise<DatasetResult> {
  const payload = allPayloads[id]
  if (!payload) {
    return { id, success: false, cells: 0, hardConstraintsSatisfied: false, message: 'Payload not found', turnsUsed: 0, toolCalls: 0, error: 'Missing payload' }
  }

  payload.apiKey = key

  console.log(`\n${'='.repeat(60)}`)
  console.log(`TESTING DATASET ${id} (attempt ${attempt})`)
  console.log(`${'='.repeat(60)}`)

  let toolCalls = 0

  try {
    const result = await runLowprizoDirectAgent(payload, {
      apiKey: key,
      strategy: 'native-tools',
      maxTurns: 20,
      debug: false,
      onProgress: (event) => {
        if (event.type === 'pi_coder_debug' && event.message?.startsWith('Tool:')) {
          toolCalls++
        }
      },
    })

    const hardSatisfied = (result.diagnostics || []).some((d: string) =>
      d.toLowerCase().includes('hard constraint') && d.toLowerCase().includes('satisf')
    ) || result.status === 'solved'

    const success = result.status === 'solved' && result.verdict === 'accept' && (result.cells?.length || 0) > 0

    // If failed and this is first attempt, retry once with stronger pressure
    if (!success && attempt === 1) {
      console.log(`Dataset ${id} failed on first attempt. Retrying with stronger submit pressure...`)
      // Modify prompt slightly by adding extra context
      payload.userNotes = "IMPORTANT: You must submit a solution in this attempt. Do not exceed 12 tool calls without submitting."
      return testDataset(id, 2)
    }

    return {
      id,
      success,
      cells: result.cells?.length || 0,
      hardConstraintsSatisfied: hardSatisfied,
      message: result.message || '',
      turnsUsed: 0,
      toolCalls,
    }
  } catch (err: any) {
    return {
      id,
      success: false,
      cells: 0,
      hardConstraintsSatisfied: false,
      message: '',
      turnsUsed: 0,
      toolCalls,
      error: err.message,
    }
  }
}

async function main() {
  console.log('=== FULL DATASET TEST SUITE (devstral-latest only) ===\n')

  const results: DatasetResult[] = []

  for (let id = 1; id <= 6; id++) {
    const res = await testDataset(id)
    results.push(res)

    console.log(`DATASET ${id}: ${res.success ? '✅ SUCCESS' : '❌ FAILED'}`)
    console.log(`  Cells: ${res.cells}`)
    console.log(`  Hard constraints satisfied: ${res.hardConstraintsSatisfied}`)
    console.log(`  Tool calls: ${res.toolCalls}`)
    if (res.error) console.log(`  Error: ${res.error}`)
    if (res.message) console.log(`  Message: ${res.message.slice(0, 120)}`)
  }

  console.log('\n' + '='.repeat(70))
  console.log('SUMMARY')
  console.log('='.repeat(70))

  const successes = results.filter(r => r.success).length
  const withCells = results.filter(r => r.cells > 0).length
  const hardOk = results.filter(r => r.hardConstraintsSatisfied).length

  console.log(`Total datasets: 6`)
  console.log(`Successful submissions: ${successes}/6`)
  console.log(`Produced cells: ${withCells}/6`)
  console.log(`Hard constraints satisfied: ${hardOk}/6`)

  console.log('\nDetailed results:')
  results.forEach(r => {
    const status = r.success ? '✅' : '❌'
    console.log(`  DS${r.id}: ${status}  cells=${r.cells}  hardOK=${r.hardConstraintsSatisfied}  tools=${r.toolCalls}`)
  })

  // Save full results
  fs.writeFileSync('/tmp/dataset-test-results.json', JSON.stringify(results, null, 2))
  console.log('\nFull results saved to /tmp/dataset-test-results.json')
}

main().catch(console.error)
