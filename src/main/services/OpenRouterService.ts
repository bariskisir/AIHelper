/**
 * Solves scanned multiple-choice questions through OpenRouter's Jev Decisions endpoint.
 */

import { OPENROUTER_MODEL } from '@shared/providers'
import { z } from 'zod'
import { httpFetch } from '../http/http.fetch'

/** OpenRouter alpha Decisions endpoint that routes requests to the Jev model. */
const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions'
/** Probability above which a Jev `noul` answer counts as a selected option. */
const NOUL_THRESHOLD = 0.5

/** Validates the subset of the Decisions response consumed by the application. */
const decisionsResponseSchema = z.object({
  model: z.string().optional(),
  provider: z.string().optional(),
  answers: z
    .record(
      z.string(),
      z.object({
        type: z.string().optional(),
        noul: z.number().optional(),
        choice: z.string().optional(),
        confidence: z.number().optional(),
      }),
    )
    .optional(),
  usage: z
    .object({
      cost: z.number().optional(),
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
    })
    .optional(),
})

/** Fetch-compatible function signature so tests can inject a stub network client. */
export type OpenRouterFetcher = typeof fetch

interface ParsedOption {
  label: string
  text: string
}

interface ParsedQuestion {
  question: string
  options: ParsedOption[]
}

const LABELED_OPTION = /^\(?([A-Za-z]|\d{1,2})\)?[.)\-:]\s+(.+)$/
const BULLET_OPTION = /^[-*•]\s+(.+)$/

/** Extracts the question text and answer options from scanned OCR content. */
export const parseQuestion = (state: string): ParsedQuestion => {
  const lines = state
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const options: ParsedOption[] = []
  const questionLines: string[] = []

  for (const line of lines) {
    const labeled = LABELED_OPTION.exec(line)
    if (labeled?.[1] && labeled[2]) {
      options.push({ label: labeled[1].toUpperCase(), text: labeled[2].trim() })
      continue
    }
    const bullet = BULLET_OPTION.exec(line)
    if (bullet?.[1]) {
      options.push({ label: String.fromCharCode(65 + options.length), text: bullet[1].trim() })
      continue
    }
    if (options.length === 0) questionLines.push(line)
  }

  // Unlabeled content: assume the first line is the question and the rest are options.
  if (options.length < 2 && lines.length >= 3) {
    const first = lines[0] ?? ''
    const rest = lines.slice(1)
    return {
      question: first,
      options: rest.map((text, index) => ({
        label: String.fromCharCode(65 + index),
        text,
      })),
    }
  }

  return { question: questionLines.join(' ').trim(), options }
}

/** Solves a scanned multiple-choice question with the Jev Decisions API. */
export default class OpenRouterService {
  public constructor(private readonly fetcher: OpenRouterFetcher = httpFetch) {}

  /** Sends the scanned content to Jev and returns the selected option(s). */
  public async solve(
    state: string,
    apiKey: string,
    signal?: AbortSignal,
    onRaw?: (raw: unknown) => void,
  ): Promise<string> {
    const parsed = parseQuestion(state)
    if (parsed.options.length < 2) {
      throw new Error('Jev could not find answer options in the scanned content.')
    }

    const questions: Record<string, unknown> = {}
    parsed.options.forEach((option, index) => {
      questions[`option_${index}`] = {
        type: 'noul',
        instructions: `Is option ${option.label} ("${option.text}") part of the correct answer to the question in the content?`,
        criteria: {
          true: `Option ${option.label} belongs to the correct answer.`,
          false: `Option ${option.label} does not belong to the correct answer.`,
        },
      }
    })

    const body = JSON.stringify({
      model: OPENROUTER_MODEL,
      state: buildState(parsed),
      questions,
    })

    const response = await this.fetcher(OPENROUTER_DECISIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) {
      throw new Error(await this.readError(response))
    }

    const payload: unknown = await response.json()
    onRaw?.(payload)
    const data = decisionsResponseSchema.parse(payload)
    return formatAnswer(parsed, data)
  }

  /** Builds a readable error message from an OpenRouter error response. */
  private async readError(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { error?: { message?: unknown } }
      const message = payload.error?.message
      if (typeof message === 'string' && message.trim()) return message
    } catch {
      /* ignore malformed error bodies */
    }
    return `OpenRouter request failed with HTTP ${response.status}.`
  }
}

/** Renders the parsed question and options into the Decisions `state` string. */
const buildState = (parsed: ParsedQuestion): string => {
  const options = parsed.options.map((option) => `${option.label}) ${option.text}`).join('\n')
  return `Question: ${parsed.question || 'Select the correct answer.'}\n\nOptions:\n${options}`
}

/** Selects every option whose Jev `noul` probability clears the threshold. */
const formatAnswer = (
  parsed: ParsedQuestion,
  data: z.infer<typeof decisionsResponseSchema>,
): string => {
  const scores = parsed.options.map((_, index) => data.answers?.[`option_${index}`]?.noul ?? 0)
  const selected = parsed.options.filter((_, index) => (scores[index] ?? 0) >= NOUL_THRESHOLD)
  const chosen = selected.length > 0 ? selected : pickHighest(parsed, scores)
  if (chosen.length === 0) return 'No answer could be determined.'
  return `Selected:\n${chosen.map((option) => `- ${option.label}) ${option.text}`).join('\n')}`
}

/** Falls back to the highest-scoring option when none clear the threshold. */
const pickHighest = (parsed: ParsedQuestion, scores: number[]): ParsedOption[] => {
  let bestIndex = -1
  let bestScore = Number.NEGATIVE_INFINITY
  scores.forEach((score, index) => {
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  const option = bestIndex >= 0 ? parsed.options[bestIndex] : undefined
  return option ? [option] : []
}
