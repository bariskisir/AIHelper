/**
 * Orchestrates AI scan requests through ChatGPT or OpenRouter (Jev).
 */

import type { AiModel, AppSettings, ScanMode, ThinkingLevel } from '@shared/types'
import { OPENROUTER_MODEL } from '@shared/providers'
import type ChatGptService from './ChatGptService'
import type CredentialService from './CredentialService'
import type LoggerService from './LoggerService'
import type OpenRouterService from './OpenRouterService'

export interface StreamCallbacks {
  onDelta: (delta: string) => void
  signal: AbortSignal
  /** Receives the raw provider payload when the provider returns a structured response. */
  onRaw?: (raw: unknown) => void
}

export default class AiProviderService {
  public constructor(
    private readonly chatGpt: ChatGptService,
    private readonly openRouter: OpenRouterService,
    private readonly credentials: CredentialService,
    private readonly logger: LoggerService,
  ) {}

  /** Resolves the effective system prompt for the scan mode and settings. */
  public resolveSystemPrompt(settings: AppSettings, scanMode: ScanMode): string {
    const presetId =
      scanMode === 'text' ? settings.textSystemPromptPreset : settings.imageSystemPromptPreset
    const custom =
      scanMode === 'text' ? settings.textCustomSystemPrompt : settings.imageCustomSystemPrompt
    if (presetId === 'custom') return custom.trim()
    const preset = settings.systemPrompts.find((p) => p.id === presetId)
    if (preset?.text) return preset.text
    return scanMode === 'text'
      ? 'You are a careful problem solver. Read the selected content, solve accurately, and give the final answer clearly.'
      : 'You are a careful image problem solver. Analyze the selected image area, solve math accurately, interpret charts, diagrams, UI, or other image content when present, and give the key answer concisely and clearly.'
  }

  /** Resolves the current AI model for the active provider and scan mode. */
  public resolveModel(settings: AppSettings, scanMode?: ScanMode): string {
    if (settings.aiProvider === 'openrouter') return OPENROUTER_MODEL
    let model =
      scanMode === 'text' ? settings.textModel : scanMode === 'image' ? settings.imageModel : ''
    if (!model || model === 'chatgpt:::') {
      model = settings.chatGptModel
    }
    if (model.includes(':::')) {
      model = model.split(':::').pop() || model
    }
    return model.trim()
  }

  /** Resolves the current thinking level. */
  public resolveThinkingLevel(settings: AppSettings, scanMode?: ScanMode): string {
    const modeThinking =
      scanMode === 'text'
        ? settings.textThinkingLevel
        : scanMode === 'image'
          ? settings.imageThinkingLevel
          : ''
    if (modeThinking) return modeThinking
    return settings.chatGptThinkingLevel
  }

  /** Fetches available ChatGPT models. */
  public async fetchModels(): Promise<AiModel[]> {
    await this.chatGpt.refresh()
    return this.chatGpt.getState().models
  }

  /**
   * Streams a text/image scan through the active provider. OpenRouter requests are
   * solved by Jev and emitted as a single delta.
   */
  public async streamScan(
    settings: AppSettings,
    scanMode: ScanMode,
    userInput: string,
    imageDataUrl: string | undefined,
    callbacks: StreamCallbacks,
  ): Promise<string> {
    if (settings.aiProvider === 'openrouter') {
      const apiKey = await this.credentials.getOpenRouterApiKey()
      if (!apiKey) throw new Error('An OpenRouter API key is required.')
      this.logger.info('AiProviderService', 'Starting Jev decision request', {
        scanMode,
        model: OPENROUTER_MODEL,
        textLength: userInput.length,
      })
      const answer = await this.openRouter.solve(
        userInput,
        apiKey,
        callbacks.signal,
        callbacks.onRaw,
      )
      callbacks.onDelta(answer)
      return answer
    }

    const systemPrompt = this.resolveSystemPrompt(settings, scanMode)
    const model = this.resolveModel(settings, scanMode)
    const thinkingLevel = (this.resolveThinkingLevel(settings, scanMode) || 'low') as ThinkingLevel

    this.logger.info('AiProviderService', 'Starting scan stream', {
      scanMode,
      model,
      thinkingLevel,
      hasImage: !!imageDataUrl,
    })

    return this.chatGpt.streamScan(
      systemPrompt,
      userInput,
      imageDataUrl ? extractBase64(imageDataUrl) : undefined,
      model,
      thinkingLevel,
      settings.chatGptVerbosity,
      settings.chatGptServiceTier,
      callbacks.onDelta,
      callbacks.signal,
    )
  }
}

/** Extracts base64 from a data URL string. */
const extractBase64 = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}
