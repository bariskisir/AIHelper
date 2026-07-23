/**
 * Centralizes persisted and IPC settings validation for AIHelper.
 */

import {
  APP_LOCALES,
  DEFAULT_SETTINGS,
  LOG_LEVELS,
  SERVICE_TIERS,
  THEME_MODES,
  THINKING_LEVELS,
  TIME_FORMATS,
  VERBOSITY_LEVELS,
  type AppSettings,
} from '@shared/types'
import { z } from 'zod'

const systemPromptSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  text: z.string().max(10_000),
  isBuiltIn: z.boolean(),
  type: z.enum(['text', 'image']).optional(),
})

const settingsFieldsSchema = z.object({
  settingsRevision: z.literal(1),
  uiLanguage: z.enum(APP_LOCALES),
  theme: z.enum(THEME_MODES),
  timeFormat: z.enum(TIME_FORMATS),
  chatGptModel: z.string().max(100),
  chatGptThinkingLevel: z.enum(THINKING_LEVELS),
  chatGptVerbosity: z.enum(VERBOSITY_LEVELS),
  chatGptServiceTier: z.enum(SERVICE_TIERS),
  textModel: z.string().max(100),
  textThinkingLevel: z.enum(THINKING_LEVELS),
  imageModel: z.string().max(100),
  imageThinkingLevel: z.enum(THINKING_LEVELS),
  textSystemPromptPreset: z.string().max(100),
  textCustomSystemPrompt: z.string().max(10_000),
  imageSystemPromptPreset: z.string().max(100),
  imageCustomSystemPrompt: z.string().max(10_000),
  systemPrompts: z.array(systemPromptSchema),
  compactMode: z.boolean(),
  alwaysOnTop: z.boolean(),
  autoUpdate: z.boolean(),
  logLevel: z.enum(LOG_LEVELS),
})

/** Complete Zod schema for validating persisted application settings. */
export const settingsSchema = settingsFieldsSchema

/** Partial settings schema used for IPC patches, requiring at least one field. */
export const settingsPatchSchema = settingsFieldsSchema
  .omit({ settingsRevision: true })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'At least one setting must be provided.')

/** Guards a value as a plain object, returning null for primitives, arrays, and null. */
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** Parses untrusted persisted settings, falling back to safe defaults for missing or invalid fields. */
export const parsePersistedSettings = (input: unknown): AppSettings => {
  const data = asRecord(input)
  if (!data) return structuredClone(DEFAULT_SETTINGS)

  const candidate = { ...DEFAULT_SETTINGS, ...data, settingsRevision: 1 as const }
  const parsed = settingsSchema.safeParse(candidate)
  if (parsed.success) return parsed.data

  const safe: Partial<AppSettings> = {}
  if (APP_LOCALES.includes(candidate.uiLanguage as AppSettings['uiLanguage']))
    safe.uiLanguage = candidate.uiLanguage as AppSettings['uiLanguage']
  if (THEME_MODES.includes(candidate.theme as AppSettings['theme']))
    safe.theme = candidate.theme as AppSettings['theme']
  if (typeof candidate.chatGptModel === 'string') safe.chatGptModel = candidate.chatGptModel
  if (typeof candidate.textModel === 'string') safe.textModel = candidate.textModel
  if (typeof candidate.imageModel === 'string') safe.imageModel = candidate.imageModel

  const fallback = { ...DEFAULT_SETTINGS, ...safe } as AppSettings
  return settingsSchema.parse(fallback)
}
