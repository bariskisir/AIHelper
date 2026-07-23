/**
 * Tests settings schema validation, patch parsing, and persisted settings recovery.
 */

import { describe, expect, it } from 'vitest'
import {
  parsePersistedSettings,
  settingsPatchSchema,
  settingsSchema,
} from '../src/main/settingsSchema'
import { DEFAULT_SETTINGS } from '../src/shared/types'

describe('settingsSchema', () => {
  it('accepts valid full settings', () => {
    const result = settingsSchema.safeParse(DEFAULT_SETTINGS)
    expect(result.success).toBe(true)
  })

  it('rejects settings with an invalid locale', () => {
    const result = settingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      uiLanguage: 'ja',
    })
    expect(result.success).toBe(false)
  })

  it('rejects settings with an invalid theme', () => {
    const result = settingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      theme: 'blue',
    })
    expect(result.success).toBe(false)
  })

  it('rejects settings with an invalid log level', () => {
    const result = settingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      logLevel: 'trace',
    })
    expect(result.success).toBe(false)
  })

  it('rejects settings with wrong revision', () => {
    const result = settingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      settingsRevision: 2,
    })
    expect(result.success).toBe(false)
  })

  it('rejects overly long model names', () => {
    const result = settingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      chatGptModel: 'a'.repeat(101),
    })
    expect(result.success).toBe(false)
  })
})

describe('settingsPatchSchema', () => {
  it('accepts a partial patch with one field', () => {
    const result = settingsPatchSchema.safeParse({ compactMode: true })
    expect(result.success).toBe(true)
  })

  it('rejects an empty patch', () => {
    const result = settingsPatchSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects a patch with the reserved settingsRevision field', () => {
    const result = settingsPatchSchema.safeParse({ settingsRevision: 1 as const })
    expect(result.success).toBe(false)
  })

  it('accepts patches with multiple valid fields', () => {
    const result = settingsPatchSchema.safeParse({
      theme: 'dark',
      compactMode: true,
      alwaysOnTop: true,
    })
    expect(result.success).toBe(true)
  })
})

describe('parsePersistedSettings', () => {
  it('returns default settings for null input', () => {
    const result = parsePersistedSettings(null)
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('returns default settings for non-object input', () => {
    const result = parsePersistedSettings('invalid')
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('merges persisted fields with defaults', () => {
    const result = parsePersistedSettings({
      compactMode: true,
      alwaysOnTop: true,
      settingsRevision: 1,
    })
    expect(result.compactMode).toBe(true)
    expect(result.alwaysOnTop).toBe(true)
    expect(result.settingsRevision).toBe(1)
  })

  it('preserves valid locale from partial data', () => {
    const result = parsePersistedSettings({ uiLanguage: 'tr' })
    expect(result.uiLanguage).toBe('tr')
  })

  it('ignores invalid fields in persisted data', () => {
    const result = parsePersistedSettings({ unknownField: 123, theme: 'dark' })
    expect(result.theme).toBe('dark')
  })

  it('fills missing fields with defaults', () => {
    const result = parsePersistedSettings({})
    expect(result.uiLanguage).toBe('en')
    expect(result.theme).toBe('system')
    expect(result.logLevel).toBe('info')
  })
})
