/**
 * Orchestrates AI scan requests through ChatGPT.
 */

import type { AiModel, AppSettings, ScanMode, ThinkingLevel } from '@shared/types'
import type ChatGptService from './ChatGptService'
import type LoggerService from './LoggerService'

export interface StreamCallbacks {
  onDelta: (delta: string) => void
  signal: AbortSignal
}

export default class AiProviderService {
  public constructor(
    private readonly chatGpt: ChatGptService,
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
   * Streams a text/image scan through ChatGPT.
   */
  public async streamScan(
    settings: AppSettings,
    scanMode: ScanMode,
    userInput: string,
    imageDataUrl: string | undefined,
    callbacks: StreamCallbacks,
  ): Promise<string> {
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
