/**
 * Verifies OpenRouter Jev integration: option parsing, noul selection, and error handling.
 */

import { describe, expect, it, vi } from 'vitest'
import OpenRouterService, {
  type OpenRouterFetcher,
  parseQuestion,
} from '../src/main/services/OpenRouterService'

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('parseQuestion', () => {
  it('extracts the question and labeled options', () => {
    const parsed = parseQuestion('Can I park here?\nA) Sorry\nB) Same place\nC) Half an hour')
    expect(parsed.question).toBe('Can I park here?')
    expect(parsed.options).toEqual([
      { label: 'A', text: 'Sorry' },
      { label: 'B', text: 'Same place' },
      { label: 'C', text: 'Half an hour' },
    ])
  })

  it('treats remaining lines as options when they are unlabeled', () => {
    const parsed = parseQuestion('Pick one\nFirst\nSecond\nThird')
    expect(parsed.question).toBe('Pick one')
    expect(parsed.options.map((option) => option.text)).toEqual(['First', 'Second', 'Third'])
  })
})

describe('OpenRouterService', () => {
  it('asks one noul question per option and returns those above the threshold', async () => {
    let captured: RequestInit | undefined
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      captured = init
      return jsonResponse({
        answers: {
          option_0: { type: 'noul', noul: 0.91 },
          option_1: { type: 'noul', noul: 0.2 },
          option_2: { type: 'noul', noul: 0.75 },
        },
      })
    })
    const service = new OpenRouterService(fetcher as unknown as OpenRouterFetcher)

    const answer = await service.solve('Q?\nA) One\nB) Two\nC) Three', 'key')

    expect(answer).toContain('A) One')
    expect(answer).toContain('C) Three')
    expect(answer).not.toContain('B) Two')
    const body = JSON.parse(captured?.body as string)
    expect(body.model).toBe('~typesafe/jev-latest')
    expect(Object.keys(body.questions)).toEqual(['option_0', 'option_1', 'option_2'])
  })

  it('falls back to the highest scoring option when none clear the threshold', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        answers: {
          option_0: { type: 'noul', noul: 0.3 },
          option_1: { type: 'noul', noul: 0.4 },
        },
      }),
    )
    const service = new OpenRouterService(fetcher as unknown as OpenRouterFetcher)

    const answer = await service.solve('Q?\nA) One\nB) Two', 'key')

    expect(answer).toContain('B) Two')
  })

  it('throws when the content has no answer options', async () => {
    const service = new OpenRouterService(vi.fn() as unknown as OpenRouterFetcher)

    await expect(service.solve('just a sentence', 'key')).rejects.toThrow(/options/)
  })

  it('surfaces the OpenRouter error message on failure', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: { message: 'Invalid API key' } }, 401))
    const service = new OpenRouterService(fetcher as unknown as OpenRouterFetcher)

    await expect(service.solve('Q?\nA) One\nB) Two', 'key')).rejects.toThrow('Invalid API key')
  })
})
