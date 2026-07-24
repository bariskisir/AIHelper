/**
 * Verifies that parsePersistedSettings safely handles null, primitives, arrays,
 * malformed objects, partial valid settings, invalid field types, and a mismatched
 * settingsRevision — always returning a structurally complete AppSettings value.
 */

import { describe, expect, it } from 'vitest'
import { parsePersistedSettings } from '../src/main/settingsSchema'
import { DEFAULT_SETTINGS } from '../src/shared/types'

// ---------------------------------------------------------------------------
// Truth table
// ---------------------------------------------------------------------------

describe('parsePersistedSettings', () => {
  // -- non-object / falsy input ---------------------------------------------

  it('returns a clone of DEFAULT_SETTINGS for null input', () => {
    const result = parsePersistedSettings(null)

    expect(result).toEqual(DEFAULT_SETTINGS)
    expect(result).not.toBe(DEFAULT_SETTINGS) // must be a deep copy
  })

  it('returns defaults for undefined input', () => {
    expect(parsePersistedSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for primitive string input', () => {
    expect(parsePersistedSettings('corrupt')).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for primitive number input', () => {
    expect(parsePersistedSettings(42)).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for primitive boolean input', () => {
    expect(parsePersistedSettings(true)).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for an array input', () => {
    expect(parsePersistedSettings([{ theme: 'dark' }])).toEqual(DEFAULT_SETTINGS)
  })

  // -- empty / minimal object -----------------------------------------------

  it('returns defaults when given an empty object (no overrides)', () => {
    const result = parsePersistedSettings({})

    expect(result).toEqual(DEFAULT_SETTINGS)
    expect(result.settingsRevision).toBe(1)
  })

  // -- valid partial settings -----------------------------------------------

  it('merges a single valid field with defaults', () => {
    const result = parsePersistedSettings({ theme: 'dark' })

    expect(result.theme).toBe('dark')
    expect(result.uiLanguage).toBe(DEFAULT_SETTINGS.uiLanguage)
    expect(result.settingsRevision).toBe(1)
  })

  it('merges multiple valid fields while preserving other defaults', () => {
    const result = parsePersistedSettings({
      theme: 'light',
      compactMode: true,
      timeFormat: '12-hour',
    })

    expect(result.theme).toBe('light')
    expect(result.compactMode).toBe(true)
    expect(result.timeFormat).toBe('12-hour')
    expect(result.uiLanguage).toBe(DEFAULT_SETTINGS.uiLanguage)
    expect(result.autoUpdate).toBe(DEFAULT_SETTINGS.autoUpdate)
  })

  it('accepts valid model-name strings', () => {
    const result = parsePersistedSettings({
      chatGptModel: 'gpt-5.1',
      textModel: 'claude-opus-4',
      imageModel: 'gemini-pro-vision',
    })

    expect(result.chatGptModel).toBe('gpt-5.1')
    expect(result.textModel).toBe('claude-opus-4')
    expect(result.imageModel).toBe('gemini-pro-vision')
  })

  it('accepts valid system-prompt custom text', () => {
    const result = parsePersistedSettings({
      textCustomSystemPrompt: 'Be concise.',
      imageCustomSystemPrompt: 'Describe this image.',
    })

    expect(result.textCustomSystemPrompt).toBe('Be concise.')
    expect(result.imageCustomSystemPrompt).toBe('Describe this image.')
  })

  // -- invalid field types → graceful fallback ------------------------------

  it('falls back to defaults for invalid enum values', () => {
    const result = parsePersistedSettings({
      uiLanguage: 'not-a-language',
      theme: 'dark', // valid
      logLevel: 'catastrophic', // not a valid log level
    })

    expect(result.theme).toBe('dark')
    expect(result.uiLanguage).toBe(DEFAULT_SETTINGS.uiLanguage)
    expect(result.logLevel).toBe(DEFAULT_SETTINGS.logLevel)
  })

  it('falls back to defaults for wrong-typed fields', () => {
    const result = parsePersistedSettings({
      compactMode: 'yes', // string, not boolean
      alwaysOnTop: 1, // number, not boolean
      autoUpdate: null,
      logLevel: 123,
    })

    expect(result.compactMode).toBe(false)
    expect(result.alwaysOnTop).toBe(false)
    expect(result.autoUpdate).toBe(true)
    expect(result.logLevel).toBe(DEFAULT_SETTINGS.logLevel)
  })

  it('recovers model-name strings even when other fields are invalid', () => {
    const result = parsePersistedSettings({
      uiLanguage: 'xyz', // invalid
      chatGptModel: 'recovered-model',
      textModel: 'recovered-text-model',
      imageModel: 'recovered-image-model',
    })

    expect(result.chatGptModel).toBe('recovered-model')
    expect(result.textModel).toBe('recovered-text-model')
    expect(result.imageModel).toBe('recovered-image-model')
    expect(result.uiLanguage).toBe(DEFAULT_SETTINGS.uiLanguage)
  })

  // -- settingsRevision mismatch --------------------------------------------

  it('forces settingsRevision to 1 when the input declares a different revision', () => {
    const result = parsePersistedSettings({
      settingsRevision: 99,
      theme: 'light',
    })

    expect(result.settingsRevision).toBe(1)
    expect(result.theme).toBe('light')
  })

  it('forces settingsRevision to 1 even when revision is zero or negative', () => {
    expect(parsePersistedSettings({ settingsRevision: 0 }).settingsRevision).toBe(1)
    expect(parsePersistedSettings({ settingsRevision: -1 }).settingsRevision).toBe(1)
  })

  it('forces settingsRevision to 1 when revision is a non-numeric value', () => {
    const result = parsePersistedSettings({
      settingsRevision: 'latest',
    } as unknown)

    expect(result.settingsRevision).toBe(1)
  })

  // -- objects with only unknown keys ---------------------------------------

  it('ignores keys that are not part of the schema and returns defaults', () => {
    const result = parsePersistedSettings({
      unknownKey: 'value',
      anotherUnknown: 42,
      deeply: { nested: true },
    })

    // All schema fields come from defaults
    expect(result).toEqual(DEFAULT_SETTINGS)
    // Confirm no unknown keys leaked through
    expect((result as unknown as Record<string, unknown>).unknownKey).toBeUndefined()
  })

  // -- stability guarantee --------------------------------------------------

  it('always returns a structurally complete AppSettings object', () => {
    const inputs: unknown[] = [
      null,
      undefined,
      '',
      0,
      false,
      [],
      {},
      { theme: 'dark' },
      { settingsRevision: 2, uiLanguage: 'tr' },
      { __proto__: null },
    ]

    for (const input of inputs) {
      const result = parsePersistedSettings(input)

      expect(result.settingsRevision).toBe(1)
      expect(typeof result.uiLanguage).toBe('string')
      expect(typeof result.theme).toBe('string')
      expect(typeof result.timeFormat).toBe('string')
      expect(typeof result.chatGptModel).toBe('string')
      expect(typeof result.compactMode).toBe('boolean')
      expect(typeof result.alwaysOnTop).toBe('boolean')
      expect(typeof result.autoUpdate).toBe('boolean')
      expect(typeof result.logLevel).toBe('string')
      expect(Array.isArray(result.systemPrompts)).toBe(true)
    }
  })
})
