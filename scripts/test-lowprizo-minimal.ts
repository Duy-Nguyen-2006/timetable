/**
 * Ultra-minimal test: pure chat + marker parsing (no tools, no json_object)
 * Goal: find a prompt format that Lowprizo devstral will actually respond to with usable actions.
 */

import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'

const key = fs.readFileSync(path.join(__dirname, '..', 'keytest.txt'), 'utf8').trim()
const openai = new OpenAI({ apiKey: key, baseURL: 'https://api.lowprizo.com/v1' })

const MODEL = 'devstral-latest'

async function run() {
  const sandbox = `/tmp/tack-minimal-${randomUUID()}`
  fs.mkdirSync(sandbox, { recursive: true })

  // Copy templates
  fs.copyFileSync('python/timetable_solver/template_solver.py', path.join(sandbox, 'template_solver.py'))

  const system = `You are a Python programmer. You can only work inside ${sandbox}.
When you want to do something, end your message with exactly this format on its own line:
ACTION: {"action":"read|write|run|submit","args":{...}}

Base rules: one teacher one class per slot, one class one subject per slot.`

  const messages: any[] = [
    { role: 'system', content: system },
    { role: 'user', content: `Problem: 5 days, 2 sessions, 4 assignments. Hard: Cô Hương không dạy tiết 1 sáng. Write a working OR-Tools solver and run it. Start by reading the template.` },
  ]

  for (let i = 1; i <= 12; i++) {
    console.log(`\n=== Turn ${i} ===`)
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 2000,
    })

    const text = res.choices[0].message.content || ''
    console.log('MODEL SAID:\n' + text.slice(0, 800))
    messages.push({ role: 'assistant', content: text })

    // Look for ACTION marker
    const match = text.match(/ACTION:\s*(\{[\s\S]*\})/)
    if (match) {
      try {
        const action = JSON.parse(match[1])
        console.log('PARSED ACTION:', action)

        if (action.action === 'submit') {
          console.log('SUCCESS - got submit!')
          break
        }
        // For now just continue the conversation
        messages.push({ role: 'user', content: `Action ${action.action} executed (simulated). Continue.` })
      } catch (e) {
        console.log('Bad JSON in action')
      }
    } else {
      messages.push({ role: 'user', content: 'Remember to end with ACTION: {...} when you want to act.' })
    }

    await new Promise(r => setTimeout(r, 800)) // small delay to avoid rate limits
  }

  // cleanup
  fs.rmSync(sandbox, { recursive: true, force: true })
}

run().catch(console.error)
