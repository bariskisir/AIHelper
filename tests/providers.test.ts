/**
 * Verifies that selectPreferredModelId correctly picks the most suitable model
 * from an AiModel[] list: prefers a "mini" variant, then "terra", then the
 * explicitly-default model, and finally falls back to the first entry.
 */

import { describe, expect, it } from 'vitest'
import { selectPreferredModelId } from '../src/shared/providers'
import type { AiModel } from '../src/shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeModel = (overrides: Partial<AiModel> = {}): AiModel => ({
  id: 'generic-model',
  displayName: 'Generic Model',
  description: '',
  isDefault: false,
  supportsThinking: false,
  thinkingVariants: [],
  ...overrides,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectPreferredModelId', () => {
  // -- empty / nil list -----------------------------------------------------

  it('returns an empty string when the model list is empty', () => {
    expect(selectPreferredModelId([])).toBe('')
  })

  it('returns an empty string when the model list is null or undefined (safety)', () => {
    expect(selectPreferredModelId(null as unknown as AiModel[])).toBe('')
    expect(selectPreferredModelId(undefined as unknown as AiModel[])).toBe('')
  })

  // -- "mini" preference ----------------------------------------------------

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

  it('prefers the first mini match when multiple exist', () => {
    const models: AiModel[] = [
      makeModel({ id: 'alpha-mini', displayName: 'Alpha Mini' }),
      makeModel({ id: 'beta-mini', displayName: 'Beta Mini' }),
    ]

    expect(selectPreferredModelId(models)).toBe('alpha-mini')
  })

  // -- "terra" fallback -----------------------------------------------------

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

  // -- explicit isDefault ---------------------------------------------------

  it('falls back to the explicitly-default model when neither mini nor terra exists', () => {
    const models: AiModel[] = [
      makeModel({ id: 'regular', displayName: 'Regular' }),
      makeModel({ id: 'preferred', displayName: 'Preferred', isDefault: true }),
      makeModel({ id: 'other', displayName: 'Other' }),
    ]

    expect(selectPreferredModelId(models)).toBe('preferred')
  })

  // -- first entry fallback -------------------------------------------------

  it('falls back to the first model in the list when nothing else matches', () => {
    const models: AiModel[] = [
      makeModel({ id: 'first-model', displayName: 'First Model' }),
      makeModel({ id: 'second-model', displayName: 'Second Model' }),
    ]

    expect(selectPreferredModelId(models)).toBe('first-model')
  })

  // -- priority order -------------------------------------------------------

  it('respects priority: mini > terra > default > first', () => {
    const models: AiModel[] = [
      makeModel({ id: 'fallback-first', displayName: 'Fallback First' }),
      makeModel({ id: 'explicit-default', displayName: 'Explicit Default', isDefault: true }),
      makeModel({ id: 'terra-model', displayName: 'Terra Model' }),
      makeModel({ id: 'mini-model', displayName: 'Mini Model' }),
    ]

    // mini wins even though it's last in the array
    expect(selectPreferredModelId(models)).toBe('mini-model')
  })
})
