/**
 * Verifies that rapid settings writes are serialised without overwriting in-flight updates.
 */

import { describe, expect, it, vi } from 'vitest'
import SettingsPersistenceQueue from '../src/renderer/src/services/SettingsPersistenceQueue'
import type { AppSettings, AppSettingsPatch } from '../src/shared/types'

describe('SettingsPersistenceQueue', () => {
  const makeSettings = (overrides: Partial<AppSettings> = {}): AppSettings => {
    const base = {
      settingsRevision: 1 as const,
      uiLanguage: 'en' as const,
      theme: 'system' as const,
      timeFormat: '24-hour' as const,
      chatGptModel: '',
      chatGptThinkingLevel: 'low' as const,
      chatGptVerbosity: 'low' as const,
      chatGptServiceTier: 'normal' as const,
      textModel: '',
      textThinkingLevel: 'low' as const,
      imageModel: '',
      imageThinkingLevel: 'low' as const,
      textSystemPromptPreset: 'text-solver',
      textCustomSystemPrompt: '',
      imageSystemPromptPreset: 'image-solver',
      imageCustomSystemPrompt: '',
      systemPrompts: [],
      compactMode: false,
      alwaysOnTop: false,
      autoUpdate: true,
      logLevel: 'info' as const,
    }
    return { ...base, ...overrides } as AppSettings
  }

  it('serialises two concurrent patches so the second sees the first result', async () => {
    const queue = new SettingsPersistenceQueue()
    let durable = makeSettings()
    const persisted: AppSettings[] = []

    const persist = vi.fn(async (patch: AppSettingsPatch): Promise<AppSettings> => {
      durable = { ...durable, ...patch } as AppSettings
      persisted.push(durable)
      return durable
    })

    await Promise.all([
      queue.enqueue({ theme: 'light' }, persist),
      queue.enqueue({ logLevel: 'debug' }, persist),
    ])

    expect(persisted).toHaveLength(2)
    expect(persisted[1]).toMatchObject({ theme: 'light', logLevel: 'debug' })
  })

  it('recovers after a preceding write fails and uses the caller fallback', async () => {
    const queue = new SettingsPersistenceQueue()
    const failing = vi.fn(async (): Promise<AppSettings> => {
      throw new Error('disk full')
    })

    await expect(queue.enqueue({ theme: 'light' }, failing)).rejects.toThrow('disk full')

    const fallback = makeSettings({ theme: 'dark' })
    const result = await queue.enqueue({ logLevel: 'debug' }, async (patch) => ({
      ...fallback,
      ...patch,
    }))

    expect(result).toMatchObject({ theme: 'dark', logLevel: 'debug' })
  })

  it('forwards a successful result to the caller', async () => {
    const queue = new SettingsPersistenceQueue()
    const expected = makeSettings({ theme: 'light' })

    const result = await queue.enqueue({ theme: 'light' }, async () => expected)
    expect(result).toBe(expected)
  })
})
