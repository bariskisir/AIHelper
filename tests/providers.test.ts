/**
 * Verifies that selectPreferredModelId correctly picks the preferred model
 * using priority: mini → terra → sol → alphabetical first.
 */

import { describe, expect, it } from 'vitest'
import { selectPreferredModelId } from '../src/shared/providers'
import type { AiModel } from '../src/shared/types'

const makeModel = (overrides: Partial<AiModel> = {}): AiModel => ({
  id: 'generic-model',
  displayName: 'Generic Model',
  description: '',
  isDefault: false,
  supportsThinking: false,
  thinkingVariants: [],
  ...overrides,
})

describe('selectPreferredModelId', () => {
  it('returns an empty string when the model list is empty', () => {
    expect(selectPreferredModelId([])).toBe('')
  })

  it('picks the first model whose id contains "mini" (case-insensitive)', () => {
    const models: AiModel[] = [
      makeModel({ id: 'gpt-5.1', displayName: 'GPT-5.1' }),
      makeModel({ id: 'gpt-5.1-mini', displayName: 'GPT-5.1 Mini' }),
      makeModel({ id: 'gpt-5.1-nano', displayName: 'GPT-5.1 Nano' }),
    ]
    expect(selectPreferredModelId(models)).toBe('gpt-5.1-mini')
  })

  it('picks a model whose displayName contains "mini" when id does not', () => {
    const models: AiModel[] = [
      makeModel({ id: 'standard', displayName: 'Standard' }),
      makeModel({ id: 'fast-model', displayName: 'Fast Mini' }),
    ]
    expect(selectPreferredModelId(models)).toBe('fast-model')
  })

  it('picks the alphabetically first when multiple models match the same keyword', () => {
    const models: AiModel[] = [
      makeModel({ id: 'zeta-mini', displayName: 'Zeta Mini' }),
      makeModel({ id: 'alpha-mini', displayName: 'Alpha Mini' }),
    ]
    expect(selectPreferredModelId(models)).toBe('alpha-mini')
  })

  it('falls back to a "terra" model when no mini is present', () => {
    const models: AiModel[] = [
      makeModel({ id: 'gpt-5.1', displayName: 'GPT-5.1' }),
      makeModel({ id: 'gpt-5.1-terra', displayName: 'GPT-5.1 Terra' }),
    ]
    expect(selectPreferredModelId(models)).toBe('gpt-5.1-terra')
  })

  it('matches terra in displayName when id does not contain it', () => {
    const models: AiModel[] = [
      makeModel({ id: 'model-x', displayName: 'Model X' }),
      makeModel({ id: 'model-y', displayName: 'Terra Edition' }),
    ]
    expect(selectPreferredModelId(models)).toBe('model-y')
  })

  it('falls back to a "sol" model when neither mini nor terra exists', () => {
    const models: AiModel[] = [
      makeModel({ id: 'gpt-5.1', displayName: 'GPT-5.1' }),
      makeModel({ id: 'gpt-5.6-sol', displayName: 'GPT-5.6 Sol' }),
    ]
    expect(selectPreferredModelId(models)).toBe('gpt-5.6-sol')
  })

  it('falls back to alphabetically first when no preferred keywords match', () => {
    const models: AiModel[] = [
      makeModel({ id: 'zeta', displayName: 'Zeta' }),
      makeModel({ id: 'alpha', displayName: 'Alpha', isDefault: true }),
    ]
    expect(selectPreferredModelId(models)).toBe('alpha')
  })

  it('respects priority: mini > terra > sol > alphabetical first', () => {
    const models: AiModel[] = [
      makeModel({ id: 'fallback', displayName: 'AAA First' }),
      makeModel({ id: 'sol-model', displayName: 'Sol Model' }),
      makeModel({ id: 'terra-model', displayName: 'Terra Model' }),
      makeModel({ id: 'mini-model', displayName: 'Mini Model' }),
    ]
    expect(selectPreferredModelId(models)).toBe('mini-model')
  })
})
