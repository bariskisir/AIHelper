import { describe, expect, it } from 'vitest'
import { renderSessions } from '../src/main/services/ExportService'
import type { SessionDocument } from '../src/shared/types'

describe('ExportService', () => {
  const sampleSession: SessionDocument = {
    id: 'session-1',
    title: 'Test Session',
    isDefaultTitle: false,
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
    item: {
      id: 'item-1',
      scanMode: 'text',
      provider: 'chatgpt',
      model: 'gpt-5.6-luna',
      thinkingLevel: 'low',
      verbosity: 'medium',
      systemPromptPreset: 'text-solver',
      systemPromptText: 'Solver prompt',
      input: 'Hello AI',
      output: 'Hello User!',
      createdAt: '2026-07-23T00:00:00.000Z',
    },
  }

  it('renders sessions as formatted TXT', () => {
    const text = renderSessions([sampleSession], 'txt')
    expect(text).toContain('Test Session')
    expect(text).toContain('Input:\nHello AI')
    expect(text).toContain('Output:\nHello User!')
  })

  it('renders sessions as valid JSON', () => {
    const json = renderSessions([sampleSession], 'json')
    const parsed = JSON.parse(json) as SessionDocument
    expect(parsed.id).toBe('session-1')
    expect(parsed.item?.input).toBe('Hello AI')
  })
})
