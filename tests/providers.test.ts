/**
 * Tests shared provider utilities including fallback models and model preference selection.
 */

import { describe, expect, it } from 'vitest'
import { selectPreferredModelId } from '../src/shared/providers'
import type { AiModel } from '../src/shared/types'

describe('selectPreferredModelId', () => {
  it('returns empty string for empty array', () => {
    expect(selectPreferredModelId([])).toBe('')
  })

  it('returns empty string for null/undefined input', () => {
    expect(selectPreferredModelId(null as unknown as AiModel[])).toBe('')
    expect(selectPreferredModelId(undefined as unknown as AiModel[])).toBe('')
  })

  it('prefers model with "mini" in id', () => {
    const models: AiModel[] = [
      {
        id: 'gpt-5.6-luna',
        displayName: 'Luna',
        description: '',
        isDefault: true,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
      {
        id: 'gpt-5.6-luna-mini',
        displayName: 'Luna Mini',
        description: '',
        isDefault: false,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
    ]
    expect(selectPreferredModelId(models)).toBe('gpt-5.6-luna-mini')
  })

  it('prefers model with "mini" in displayName', () => {
    const models: AiModel[] = [
      {
        id: 'gpt-5.6',
        displayName: 'GPT 5.6 Mini',
        description: '',
        isDefault: true,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
      {
        id: 'gpt-5.6-sol',
        displayName: 'GPT 5.6 Sol',
        description: '',
        isDefault: false,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
    ]
    expect(selectPreferredModelId(models)).toBe('gpt-5.6')
  })

  it('falls back to model with "terra" when no mini', () => {
    const models: AiModel[] = [
      {
        id: 'gpt-5.6-sol',
        displayName: 'Sol',
        description: '',
        isDefault: true,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
      {
        id: 'gpt-5.6-terra',
        displayName: 'Terra',
        description: '',
        isDefault: false,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
    ]
    expect(selectPreferredModelId(models)).toBe('gpt-5.6-terra')
  })

  it('falls back to the first default model', () => {
    const models: AiModel[] = [
      {
        id: 'gpt-5.6-sol',
        displayName: 'Sol',
        description: '',
        isDefault: false,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
      {
        id: 'gpt-5.6-luna',
        displayName: 'Luna',
        description: '',
        isDefault: true,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
    ]
    expect(selectPreferredModelId(models)).toBe('gpt-5.6-luna')
  })

  it('falls back to first model when no default is set', () => {
    const models: AiModel[] = [
      {
        id: 'gpt-5.6-sol',
        displayName: 'Sol',
        description: '',
        isDefault: false,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
      {
        id: 'gpt-5.6-luna',
        displayName: 'Luna',
        description: '',
        isDefault: false,
        supportsImages: false,
        supportsThinking: false,
        thinkingVariants: [],
      },
    ]
    expect(selectPreferredModelId(models)).toBe('gpt-5.6-sol')
  })
})
