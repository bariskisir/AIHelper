/**
 * Tests AiProviderService prompt resolution, model resolution, and scan delegation.
 */

import { describe, expect, it, vi } from 'vitest'
import AiProviderService from '../src/main/services/AiProviderService'
import type ChatGptService from '../src/main/services/ChatGptService'
import type LoggerService from '../src/main/services/LoggerService'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/types'

/** Creates a minimal test settings object with only the fields needed. */
const buildSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
})

describe('AiProviderService', () => {
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as LoggerService
  const mockChatGpt = {
    refresh: vi.fn(),
    getState: vi.fn().mockReturnValue({ models: [] }),
    streamScan: vi.fn(),
  } as unknown as ChatGptService
  const service = new AiProviderService(mockChatGpt, mockLogger)

  describe('resolveSystemPrompt', () => {
    it('returns the default text solver prompt when no preset is configured', () => {
      const settings = buildSettings()
      const result = service.resolveSystemPrompt(settings, 'text')
      expect(result).toContain('careful problem solver')
    })

    it('returns the default image solver prompt when no preset is configured', () => {
      const settings = buildSettings()
      const result = service.resolveSystemPrompt(settings, 'image')
      expect(result).toContain('careful image problem solver')
    })

    it('returns the built-in preset text when a preset matches', () => {
      const settings = buildSettings({
        textSystemPromptPreset: 'text-solver',
        systemPrompts: [
          {
            id: 'text-solver',
            name: 'Solver',
            text: 'Custom built-in prompt text.',
            isBuiltIn: true,
            type: 'text',
          },
        ],
      })
      const result = service.resolveSystemPrompt(settings, 'text')
      expect(result).toBe('Custom built-in prompt text.')
    })

    it('returns custom prompt text when preset is "custom"', () => {
      const settings = buildSettings({
        textSystemPromptPreset: 'custom',
        textCustomSystemPrompt: 'My custom text prompt  ',
      })
      const result = service.resolveSystemPrompt(settings, 'text')
      expect(result).toBe('My custom text prompt')
    })

    it('resolves image custom prompt similarly', () => {
      const settings = buildSettings({
        imageSystemPromptPreset: 'custom',
        imageCustomSystemPrompt: 'Image custom prompt.',
      })
      const result = service.resolveSystemPrompt(settings, 'image')
      expect(result).toBe('Image custom prompt.')
    })
  })

  describe('resolveModel', () => {
    it('returns the text model when scan mode is text', () => {
      const settings = buildSettings({ textModel: 'gpt-5.6-luna', chatGptModel: 'ignored' })
      expect(service.resolveModel(settings, 'text')).toBe('gpt-5.6-luna')
    })

    it('returns the image model when scan mode is image', () => {
      const settings = buildSettings({ imageModel: 'gpt-4o', chatGptModel: 'ignored' })
      expect(service.resolveModel(settings, 'image')).toBe('gpt-4o')
    })

    it('falls back to chatGptModel when mode-specific model is empty', () => {
      const settings = buildSettings({ textModel: '', chatGptModel: 'gpt-5.6-sol' })
      expect(service.resolveModel(settings, 'text')).toBe('gpt-5.6-sol')
    })

    it('strips provider prefix from model ID', () => {
      const settings = buildSettings({ textModel: 'chatgpt:::gpt-5.6-luna' })
      expect(service.resolveModel(settings, 'text')).toBe('gpt-5.6-luna')
    })

    it('returns empty string when no model is configured and no scan mode', () => {
      const settings = buildSettings({ textModel: '', imageModel: '', chatGptModel: '' })
      expect(service.resolveModel(settings)).toBe('')
    })
  })

  describe('resolveThinkingLevel', () => {
    it('returns the text thinking level when scan mode is text', () => {
      const settings = buildSettings({ textThinkingLevel: 'high' })
      expect(service.resolveThinkingLevel(settings, 'text')).toBe('high')
    })

    it('returns the image thinking level when scan mode is image', () => {
      const settings = buildSettings({ imageThinkingLevel: 'medium' })
      expect(service.resolveThinkingLevel(settings, 'image')).toBe('medium')
    })

    it('returns chatGptThinkingLevel when mode-specific level is empty', () => {
      const settings = buildSettings({
        textThinkingLevel: 'low',
        chatGptThinkingLevel: 'xhigh',
      })
      expect(service.resolveThinkingLevel(settings)).toBe('xhigh')
    })
  })

  describe('fetchModels', () => {
    it('refreshes chatGPT and returns models', async () => {
      const mockModels = [{ id: 'model-a', displayName: 'Model A' }]
      ;(mockChatGpt.getState as ReturnType<typeof vi.fn>).mockReturnValue({ models: mockModels })
      const result = await service.fetchModels()
      expect(mockChatGpt.refresh).toHaveBeenCalledOnce()
      expect((result as unknown[]).length).toBeGreaterThan(0)
    })
  })
})
