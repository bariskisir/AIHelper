/**
 * AI provider utilities.
 */

import type { AiModel } from './types'

/** OpenRouter latest-resolution alias so every request targets the newest Jev model. */
export const OPENROUTER_MODEL = '~typesafe/jev-latest'

/** Resolves the preferred model ID: mini → terra → sol → alphabetical first. */
export const selectPreferredModelId = (models: AiModel[]): string => {
  const sorted = [...models].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  )
  for (const keyword of ['mini', 'terra', 'sol']) {
    const match = sorted.find(
      (m) => m.id.toLowerCase().includes(keyword) || m.displayName.toLowerCase().includes(keyword),
    )
    if (match) return match.id
  }
  return sorted[0]?.id ?? ''
}
