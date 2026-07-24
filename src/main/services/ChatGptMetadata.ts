/**
 * Normalizes untrusted ChatGPT model-catalog and usage payloads for the renderer.
 */

import type { AiModel } from '@shared/types'

type JsonObject = Record<string, unknown>

/** Guards a value as a plain object, returning null for primitives, arrays, and null. */
const asObject = (value: unknown): JsonObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null

/** Extracts a trimmed string from unknown input, defaulting to empty string. */
const stringValue = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Converts current and older catalog field names into stable AI model options. */
export const normalizeChatGptModels = (payload: unknown): AiModel[] => {
  const root = asObject(payload)
  if (!root) return []
  const entries = Array.isArray(root.models)
    ? root.models
    : Array.isArray(root.data)
      ? root.data
      : []
  const models = entries.flatMap((entry): AiModel[] => {
    const model = asObject(entry)
    if (!model || model.hidden === true || model.visibility === 'hide') return []
    const id = stringValue(model.slug) || stringValue(model.model) || stringValue(model.id)
    if (!id) return []
    const variantsSource = Array.isArray(model.supported_reasoning_levels)
      ? model.supported_reasoning_levels
      : Array.isArray(model.supported_reasoning_efforts)
        ? model.supported_reasoning_efforts
        : Array.isArray(model.thinking_variants)
          ? model.thinking_variants
          : []
    const thinkingVariants = variantsSource.flatMap((variant): AiModel['thinkingVariants'] => {
      if (typeof variant === 'string') {
        const value = variant.trim()
        return value ? [{ value, description: '' }] : []
      }
      const option = asObject(variant)
      if (!option) return []
      const value =
        stringValue(option.effort) || stringValue(option.value) || stringValue(option.name)
      return value ? [{ value, description: stringValue(option.description) }] : []
    })
    return [
      {
        id,
        displayName: stringValue(model.display_name) || stringValue(model.displayName) || id,
        description: stringValue(model.description),
        isDefault: model.is_default === true,
        supportsThinking: thinkingVariants.length > 0,
        thinkingVariants,
      },
    ]
  })
  models.sort((left, right) => left.displayName.localeCompare(right.displayName))
  if (!models.some((model) => model.isDefault) && models[0]) models[0].isDefault = true
  return models
}

/** Formats plan usage as used percentage and a fixed local day.month hour:minute reset time. */
export const formatChatGptUsage = (payload: unknown, nowMs = Date.now()): string => {
  const root = asObject(payload)
  if (!root) return ''
  const plan = findPlanName(root)
  const rates = [
    asObject(root.rate_limit),
    ...(Array.isArray(root.additional_rate_limits)
      ? root.additional_rate_limits.map((item) => asObject(asObject(item)?.rate_limit))
      : []),
  ].filter((rate): rate is JsonObject => rate !== null)
  const limit = rates.map((rate) => formatRateLimit(rate, nowMs)).find(Boolean) ?? ''
  return [plan, limit].filter(Boolean).join(' · ')
}

/** Formats a single rate-limit window into a human-readable usage percentage with reset time. */
const formatRateLimit = (rate: JsonObject, nowMs: number): string =>
  ['primary_window', 'secondary_window']
    .flatMap((key) => {
      const window = asObject(rate[key])
      if (!window) return []
      const used = numericValue(window.used_percent)
      const seconds = numericValue(window.limit_window_seconds)
      if (used === null) return []
      const resetAt = resetTimestamp(window, nowMs)
      const prefix = seconds !== null && seconds > 0 ? `${formatWindow(seconds)}: ` : ''
      const reset = resetAt === null ? '' : ` · reset ${formatResetTime(resetAt)}`
      return [
        {
          seconds: seconds ?? 0,
          label: `${prefix}${formatPercent(Math.min(100, Math.max(0, used)))}% used${reset}`,
        },
      ]
    })
    .sort((left, right) => right.seconds - left.seconds)
    .map((window) => window.label)
    .join(' · ')

/** Resolves the earliest future reset timestamp from a rate-limit window payload. */
const resetTimestamp = (window: JsonObject, nowMs: number): number | null => {
  for (const key of [
    'reset_at',
    'resets_at',
    'resetAt',
    'resetsAt',
    'reset_timestamp',
    'resetTimestamp',
  ]) {
    const value = numericValue(window[key])
    if (value !== null && value > 0) return value > 10_000_000_000 ? value : value * 1_000
  }
  for (const key of [
    'reset_after_seconds',
    'resetAfterSeconds',
    'seconds_until_reset',
    'secondsUntilReset',
  ]) {
    const value = numericValue(window[key])
    if (value !== null && value > 0) return nowMs + value * 1_000
  }
  return null
}

/** Formats a timestamp as a local day.month hour:minute string. */
const formatResetTime = (timestampMs: number): string => {
  const date = new Date(timestampMs)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${day}.${month} ${hour}:${minute}`
}

/** Converts seconds to a human-readable window duration (e.g. "3h", "15m", "1d"). */
const formatWindow = (seconds: number): string => {
  const minutes = Math.ceil(seconds / 60)
  if (minutes % 1_440 === 0) return `${minutes / 1_440}d`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

/** Renders a numeric percentage, keeping one decimal for non-integer values. */
const formatPercent = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1)

/** Safely parses a number from unknown input, returning null for non-finite values. */
const numericValue = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

/** Recursively searches a nested object tree for a subscription plan name string. */
const findPlanName = (value: unknown, depth = 0): string => {
  if (depth > 4) return ''
  if (typeof value === 'string') return normalizePlanName(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const plan = findPlanName(item, depth + 1)
      if (plan) return plan
    }
    return ''
  }
  const object = asObject(value)
  if (!object) return ''
  for (const key of [
    'plan',
    'plan_name',
    'plan_type',
    'subscription_plan',
    'subscription_tier',
    'account_plan',
    'tier',
  ]) {
    const plan = normalizePlanName(stringValue(object[key]))
    if (plan) return plan
  }
  for (const [key, nested] of Object.entries(object)) {
    if (!/(plan|tier|subscription)/i.test(key)) continue
    const plan = findPlanName(nested, depth + 1)
    if (plan) return plan
  }
  return ''
}

/** Titles a raw plan identifier string by replacing separators with spaces and capitalizing words. */
const normalizePlanName = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
