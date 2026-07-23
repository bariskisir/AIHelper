/**
 * Tests ChatGPT model normalization and usage formatting.
 */

import { describe, expect, it } from 'vitest'
import { formatChatGptUsage, normalizeChatGptModels } from '../src/main/services/ChatGptMetadata'

describe('normalizeChatGptModels', () => {
  it('returns empty array for null payload', () => {
    const result = normalizeChatGptModels(null)
    expect(result).toEqual([])
  })

  it('returns empty array for non-object payload', () => {
    const result = normalizeChatGptModels('invalid')
    expect(result).toEqual([])
  })

  it('returns empty array when models array is empty', () => {
    const result = normalizeChatGptModels({ models: [] })
    expect(result).toEqual([])
  })

  it('parses models from the models array', () => {
    const payload = {
      models: [
        {
          slug: 'gpt-5.6-luna',
          display_name: 'GPT-5.6 Luna',
          description: 'Fast model',
          is_default: true,
          input_modalities: ['text', 'image'],
          supported_reasoning_levels: ['low', 'medium'],
        },
      ],
    }
    const result = normalizeChatGptModels(payload)
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('gpt-5.6-luna')
    expect(result[0]?.displayName).toBe('GPT-5.6 Luna')
    expect(result[0]?.isDefault).toBe(true)
    expect(result[0]?.supportsImages).toBe(true)
    expect(result[0]?.supportsThinking).toBe(true)
    expect(result[0]?.thinkingVariants).toHaveLength(2)
  })

  it('parses models from the data array fallback field', () => {
    const payload = {
      data: [
        {
          id: 'gpt-4o',
          displayName: 'GPT-4o',
          description: 'Omni model',
          is_default: false,
        },
      ],
    }
    const result = normalizeChatGptModels(payload)
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('gpt-4o')
    expect(result[0]?.displayName).toBe('GPT-4o')
    expect(result[0]?.supportsImages).toBe(false)
    expect(result[0]?.supportsThinking).toBe(false)
  })

  it('returns empty array when all models are hidden', () => {
    const payload = {
      models: [{ slug: 'hidden-model', hidden: true }],
    }
    const result = normalizeChatGptModels(payload)
    expect(result).toEqual([])
  })

  it('returns empty array when all models have visibility hide', () => {
    const payload = {
      models: [{ slug: 'secret-model', visibility: 'hide' }],
    }
    const result = normalizeChatGptModels(payload)
    expect(result).toEqual([])
  })

  it('sorts models alphabetically by display name', () => {
    const payload = {
      models: [
        { slug: 'z-model', display_name: 'Z Model' },
        { slug: 'a-model', display_name: 'A Model' },
        { slug: 'm-model', display_name: 'M Model' },
      ],
    }
    const result = normalizeChatGptModels(payload)
    expect(result.map((m) => m.id)).toEqual(['a-model', 'm-model', 'z-model'])
  })

  it('ensures at least one model is default when none marked', () => {
    const payload = {
      models: [
        { slug: 'model-a', display_name: 'Model A', is_default: false },
        { slug: 'model-b', display_name: 'Model B', is_default: false },
      ],
    }
    const result = normalizeChatGptModels(payload)
    expect(result.some((m) => m.isDefault)).toBe(true)
  })

  it('parses thinking variants from supported_reasoning_efforts', () => {
    const payload = {
      models: [
        {
          slug: 'reasoning-model',
          supported_reasoning_efforts: [
            { effort: 'low', description: 'Low effort' },
            { effort: 'high', description: 'High effort' },
          ],
        },
      ],
    }
    const result = normalizeChatGptModels(payload)
    expect(result[0]?.thinkingVariants).toHaveLength(2)
    expect(result[0]?.thinkingVariants?.[0]?.value).toBe('low')
  })

  it('returns empty thinking variants when none provided', () => {
    const payload = {
      models: [{ slug: 'no-thinking', display_name: 'No Thinking' }],
    }
    const result = normalizeChatGptModels(payload)
    expect(result[0]?.thinkingVariants).toEqual([])
  })

  it('models without thinking variants have supportsThinking false', () => {
    const payload = {
      models: [{ slug: 'no-thinking', display_name: 'No Thinking' }],
    }
    const result = normalizeChatGptModels(payload)
    expect(result[0]?.supportsThinking).toBe(false)
  })
})

describe('formatChatGptUsage', () => {
  it('returns empty string for null payload', () => {
    expect(formatChatGptUsage(null)).toBe('')
  })

  it('returns empty string for non-object payload', () => {
    expect(formatChatGptUsage('invalid')).toBe('')
  })

  it('returns the plan name when present', () => {
    const payload = {
      account_plan: 'pro',
      rate_limit: {
        primary_window: {
          used_percent: 25,
          limit_window_seconds: 3600,
          reset_at: 2_000_000_000,
        },
      },
    }
    const result = formatChatGptUsage(payload, 1_750_000_000 * 1_000)
    expect(result).toContain('Pro')
    expect(result).toContain('25% used')
  })

  it('formats usage from secondary_window', () => {
    const payload = {
      rate_limit: {
        secondary_window: {
          used_percent: 50.5,
          limit_window_seconds: 86400,
          reset_after_seconds: 7200,
        },
      },
    }
    const result = formatChatGptUsage(payload, Date.now())
    expect(result).toContain('50.5% used')
  })

  it('normalizes plan names with underscores', () => {
    const payload = {
      plan_name: 'pro_monthly_subscription',
      rate_limit: {
        primary_window: {
          used_percent: 10,
        },
      },
    }
    const result = formatChatGptUsage(payload)
    expect(result).toContain('Pro Monthly Subscription')
  })
})
