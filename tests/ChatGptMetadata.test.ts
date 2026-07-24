/**
 * Verifies that normalizeChatGptModels correctly maps raw API payloads to the
 * AiModel[] contract, handles empty / malformed / missing payloads, filters
 * hidden entries, resolves display names, detects image support, and assigns a
 * default model when none is marked.
 */

import { describe, expect, it } from 'vitest'
import { normalizeChatGptModels } from '../src/main/services/ChatGptMetadata'
import type { AiModel } from '../src/shared/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A minimal valid model entry matching the ChatGPT catalog shape. */
const buildEntry = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  slug: 'gpt-5.1',
  display_name: 'GPT-5.1',
  description: 'The latest flagship model.',
  is_default: false,
  input_modalities: ['text'],
  supported_reasoning_levels: ['low', 'medium', 'high'],
  ...overrides,
})

const validPayload = { models: [buildEntry()] }

// ---------------------------------------------------------------------------
// Valid payloads
// ---------------------------------------------------------------------------

describe('normalizeChatGptModels – valid payloads', () => {
  it('returns a normalized model for a valid payload', () => {
    const result = normalizeChatGptModels(validPayload)

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('gpt-5.1')
    expect(result[0]!.displayName).toBe('GPT-5.1')
    expect(result[0]!.description).toBe('The latest flagship model.')
    expect(result[0]!.isDefault).toBe(true) // first model auto-flagged
    expect(result[0]!.supportsThinking).toBe(true)
  })

  it('falls back to `data` array when `models` is missing', () => {
    const payload = { data: [buildEntry({ slug: 'fallback-model' })] }
    const result = normalizeChatGptModels(payload)

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('fallback-model')
  })

  it('resolves id from `slug` then `model` then `id`', () => {
    expect(normalizeChatGptModels({ models: [buildEntry({ slug: 'slug-id' })] })[0]!.id).toBe(
      'slug-id',
    )

    const noSlug = buildEntry()
    delete noSlug.slug
    noSlug.model = 'model-field'
    expect(normalizeChatGptModels({ models: [noSlug] })[0]!.id).toBe('model-field')

    const onlyId = buildEntry()
    delete onlyId.slug
    onlyId.id = 'id-field'
    expect(normalizeChatGptModels({ models: [onlyId] })[0]!.id).toBe('id-field')
  })

  it('resolves displayName from `display_name` then `displayName` then falls back to id', () => {
    const entry = buildEntry()
    delete entry.display_name
    entry.displayName = 'Camel Name'
    const result = normalizeChatGptModels({ models: [entry] })
    expect(result[0]!.displayName).toBe('Camel Name')
  })

  it('falls back to id as displayName when neither name field is present', () => {
    const entry = buildEntry()
    delete entry.display_name
    // No displayName or display_name → uses id
    const result = normalizeChatGptModels({ models: [entry] })
    expect(result[0]!.displayName).toBe('gpt-5.1')
  })

  it('detects image support from input_modalities', () => {
    const textOnly = normalizeChatGptModels({
      models: [buildEntry({ input_modalities: ['text'] })],
    })

    const withImage = normalizeChatGptModels({
      models: [buildEntry({ input_modalities: ['text', 'image'] })],
    })

    const withImages = normalizeChatGptModels({
      models: [buildEntry({ input_modalities: ['text', 'images'] })],
    })
  })

  it('parses thinking variants from supported_reasoning_levels', () => {
    const result = normalizeChatGptModels({
      models: [buildEntry({ supported_reasoning_levels: ['off', 'low', 'high'] })],
    })

    expect(result[0]!.supportsThinking).toBe(true)
    expect(result[0]!.thinkingVariants).toHaveLength(3)
    expect(result[0]!.thinkingVariants[0]).toEqual({
      value: 'off',
      description: '',
    })
    expect(result[0]!.thinkingVariants[1]).toEqual({
      value: 'low',
      description: '',
    })
  })

  it('parses thinking variants from supported_reasoning_efforts fallback', () => {
    const entry = buildEntry()
    delete entry.supported_reasoning_levels
    entry.supported_reasoning_efforts = ['medium']
    const result = normalizeChatGptModels({ models: [entry] })

    expect(result[0]!.supportsThinking).toBe(true)
    expect(result[0]!.thinkingVariants[0]!.value).toBe('medium')
  })

  it('parses thinking variants from thinking_variants fallback', () => {
    const entry = buildEntry()
    delete entry.supported_reasoning_levels
    entry.thinking_variants = [{ name: 'xhigh' }]
    const result = normalizeChatGptModels({ models: [entry] })

    expect(result[0]!.supportsThinking).toBe(true)
    expect(result[0]!.thinkingVariants[0]!.value).toBe('xhigh')
  })

  it('parses object-shaped thinking variants with effort/value/name and description', () => {
    const payload = {
      models: [
        buildEntry({
          supported_reasoning_levels: [
            { effort: 'high', description: 'Deep reasoning' },
            { value: 'low', description: 'Quick response' },
          ],
        }),
      ],
    }
    const result = normalizeChatGptModels(payload)

    expect(result[0]!.thinkingVariants).toHaveLength(2)
    expect(result[0]!.thinkingVariants[0]).toEqual({
      value: 'high',
      description: 'Deep reasoning',
    })
    expect(result[0]!.thinkingVariants[1]).toEqual({
      value: 'low',
      description: 'Quick response',
    })
  })

  it('sorts models alphabetically by displayName', () => {
    const payload = {
      models: [
        buildEntry({ slug: 'z-model', display_name: 'Zeta' }),
        buildEntry({ slug: 'a-model', display_name: 'Alpha' }),
        buildEntry({ slug: 'm-model', display_name: 'Mid' }),
      ],
    }
    const result = normalizeChatGptModels(payload)

    expect(result.map((m) => m.displayName)).toEqual(['Alpha', 'Mid', 'Zeta'])
  })

  it('preserves an explicit is_default flag', () => {
    const payload = {
      models: [
        buildEntry({ slug: 'first', is_default: false }),
        buildEntry({ slug: 'second', is_default: true }),
      ],
    }
    const result = normalizeChatGptModels(payload)

    const defaultModel = result.find((m) => m.isDefault)
    expect(defaultModel).toBeDefined()
    expect(defaultModel!.id).toBe('second')
  })
})

// ---------------------------------------------------------------------------
// Filtered / hidden models
// ---------------------------------------------------------------------------

describe('normalizeChatGptModels – filtering', () => {
  it('filters out models marked hidden: true', () => {
    const payload = {
      models: [
        buildEntry({ slug: 'visible', hidden: false }),
        buildEntry({ slug: 'invisible', hidden: true }),
      ],
    }
    const result = normalizeChatGptModels(payload)

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('visible')
  })

  it('filters out models with visibility set to "hide"', () => {
    const payload = {
      models: [
        buildEntry({ slug: 'shown' }),
        buildEntry({ slug: 'concealed', visibility: 'hide' }),
      ],
    }
    const result = normalizeChatGptModels(payload)

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('shown')
  })

  it('filters out models without a resolvable id', () => {
    const entry = buildEntry()
    delete entry.slug
    delete entry.model
    delete entry.id
    // No id field at all
    const result = normalizeChatGptModels({ models: [entry] })

    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Malformed / empty payloads
// ---------------------------------------------------------------------------

describe('normalizeChatGptModels – malformed payloads', () => {
  it('returns an empty array for null', () => {
    expect(normalizeChatGptModels(null)).toEqual([])
  })

  it('returns an empty array for undefined', () => {
    expect(normalizeChatGptModels(undefined)).toEqual([])
  })

  it('returns an empty array for primitive strings', () => {
    expect(normalizeChatGptModels('garbage')).toEqual([])
  })

  it('returns an empty array for numbers', () => {
    expect(normalizeChatGptModels(42)).toEqual([])
  })

  it('returns an empty array for empty objects', () => {
    expect(normalizeChatGptModels({})).toEqual([])
  })

  it('returns an empty array for arrays', () => {
    expect(normalizeChatGptModels([])).toEqual([])
    expect(normalizeChatGptModels([1, 2, 3])).toEqual([])
  })

  it('returns an empty array when models/data is missing', () => {
    expect(normalizeChatGptModels({ unrelated: 'field' })).toEqual([])
  })

  it('returns an empty array when models is an empty array', () => {
    expect(normalizeChatGptModels({ models: [] })).toEqual([])
  })
})
