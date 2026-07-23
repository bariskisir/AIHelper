/**
 * AI provider utilities.
 */

import type { AiModel } from './types'

/** Resolves the default selected model ID: prefers first model with "mini", then "terra", then default/first. */
export const selectPreferredModelId = (models: AiModel[]): string => {
  if (!models || models.length === 0) return ''
  const miniModel = models.find(
    (m) => m.id.toLowerCase().includes('mini') || m.displayName.toLowerCase().includes('mini'),
  )
  if (miniModel) return miniModel.id
  const terraModel = models.find(
    (m) => m.id.toLowerCase().includes('terra') || m.displayName.toLowerCase().includes('terra'),
  )
  if (terraModel) return terraModel.id
  const defaultModel = models.find((m) => m.isDefault)
  return defaultModel ? defaultModel.id : (models[0]?.id ?? '')
}
