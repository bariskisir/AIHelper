/**
 * Verifies that renderSessions produces valid JSON and human-readable TXT
 * output for single sessions, multiple sessions, and empty sessions.
 */

import { describe, expect, it } from 'vitest'
import { renderSessions } from '../src/main/services/ExportService'
import type { SessionDocument, SessionItem } from '../src/shared/types'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleItem: SessionItem = {
  id: 'item-1',
  scanMode: 'text',
  provider: 'chatgpt',
  model: 'gpt-5.1',
  thinkingLevel: 'low',
  verbosity: 'low',
  systemPromptPreset: 'text-solver',
  systemPromptText: 'Be helpful.',
  input: 'What is 2 + 2?',
  output: 'The answer is 4.',
  createdAt: '2026-08-15T10:30:00.000Z',
}

const emptySession: SessionDocument = {
  id: 's-empty',
  title: 'Empty Session',
  isDefaultTitle: true,
  createdAt: '2026-08-14T09:00:00.000Z',
  updatedAt: '2026-08-14T09:00:00.000Z',
  item: null,
}

const filledSession: SessionDocument = {
  id: 's-filled',
  title: 'Math Problem',
  isDefaultTitle: false,
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:30:00.000Z',
  item: sampleItem,
}

const imageSession: SessionDocument = {
  id: 's-image',
  title: 'Screenshot Analysis',
  isDefaultTitle: false,
  createdAt: '2026-08-16T14:00:00.000Z',
  updatedAt: '2026-08-16T14:05:00.000Z',
  item: {
    ...sampleItem,
    scanMode: 'image',
    input: 'Analyze this screenshot',
    output: 'The screenshot shows a login form.',
  },
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

describe('renderSessions – JSON', () => {
  it('exports a single session as a valid JSON object', () => {
    const output = renderSessions([filledSession], 'json')

    expect(() => JSON.parse(output)).not.toThrow()
    const parsed = JSON.parse(output)
    expect(parsed).not.toBeInstanceOf(Array)
    expect(parsed.id).toBe('s-filled')
    expect(parsed.title).toBe('Math Problem')
    expect(parsed.item).toBeDefined()
    expect(parsed.item.input).toBe('What is 2 + 2?')
  })

  it('exports multiple sessions as a valid JSON array', () => {
    const output = renderSessions([filledSession, emptySession], 'json')

    const parsed = JSON.parse(output)
    expect(parsed).toBeInstanceOf(Array)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].id).toBe('s-filled')
    expect(parsed[1].id).toBe('s-empty')
  })

  it('preserves the full item payload in JSON', () => {
    const output = renderSessions([filledSession], 'json')
    const parsed = JSON.parse(output)

    expect(parsed.item.id).toBe('item-1')
    expect(parsed.item.model).toBe('gpt-5.1')
    expect(parsed.item.thinkingLevel).toBe('low')
    expect(parsed.item.verbosity).toBe('low')
    expect(parsed.item.createdAt).toBe('2026-08-15T10:30:00.000Z')
  })

  it('handles a session with no item in JSON', () => {
    const output = renderSessions([emptySession], 'json')
    const parsed = JSON.parse(output)

    expect(parsed.item).toBeNull()
    expect(parsed.title).toBe('Empty Session')
  })
})

// ---------------------------------------------------------------------------
// TXT export
// ---------------------------------------------------------------------------

describe('renderSessions – TXT', () => {
  it('includes the session title as a header', () => {
    const output = renderSessions([filledSession], 'txt')

    expect(output).toContain('Math Problem')
    // Underline of equal signs
    expect(output).toContain('============')
  })

  it('includes the scan meta line with mode, model, and date', () => {
    const output = renderSessions([filledSession], 'txt')

    expect(output).toContain('Text Scan')
    expect(output).toContain('gpt-5.1')
    // Date formatted via toLocaleString — at least the year should appear
    expect(output).toContain('2026')
  })

  it('labels image scans correctly', () => {
    const output = renderSessions([imageSession], 'txt')

    expect(output).toContain('Image Scan')
    expect(output).not.toContain('Text Scan')
  })

  it('includes separate Input and Output sections', () => {
    const output = renderSessions([filledSession], 'txt')

    expect(output).toContain('Input:')
    expect(output).toContain('What is 2 + 2?')
    expect(output).toContain('Output:')
    expect(output).toContain('The answer is 4.')
  })

  it('renders an empty session with a placeholder', () => {
    const output = renderSessions([emptySession], 'txt')

    expect(output).toContain('Empty Session')
    expect(output).toContain('(Empty session)')
    expect(output).not.toContain('Input:')
    expect(output).not.toContain('Output:')
  })

  it('separates multiple sessions with a horizontal rule', () => {
    const output = renderSessions([filledSession, emptySession], 'txt')

    expect(output).toContain('\n---\n')
    expect(output).toContain('Math Problem')
    expect(output).toContain('Empty Session')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('renderSessions – edge cases', () => {
  it('returns valid empty JSON when the session list is empty', () => {
    const output = renderSessions([], 'json')

    const parsed = JSON.parse(output)
    expect(parsed).toEqual([])
  })

  it('returns an empty string for TXT with zero sessions', () => {
    const output = renderSessions([], 'txt')

    expect(output).toBe('')
  })
})
