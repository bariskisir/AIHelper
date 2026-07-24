/**
 * Defines serializable AIHelper domain models and cross-process application contracts.
 */

export const AI_PROVIDERS = ['chatgpt'] as const
export const APP_LOCALES = ['en', 'tr', 'de', 'fr', 'pt', 'zh', 'es'] as const
export const THEME_MODES = ['system', 'light', 'dark'] as const
export const TIME_FORMATS = ['24-hour', '12-hour'] as const
export const EXPORT_FORMATS = ['txt', 'json'] as const
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'] as const
export const SCAN_MODES = ['text', 'image'] as const
export const VERBOSITY_LEVELS = ['low', 'medium', 'high'] as const
export const SERVICE_TIERS = ['normal', 'fast'] as const
export const THINKING_LEVELS = ['off', 'low', 'medium', 'high', 'xhigh'] as const

export type AiProvider = string
export type AppLocale = (typeof APP_LOCALES)[number]
export type ThemeMode = (typeof THEME_MODES)[number]
export type TimeFormat = (typeof TIME_FORMATS)[number]
export type ExportFormat = (typeof EXPORT_FORMATS)[number]
export type LogLevel = (typeof LOG_LEVELS)[number]
export type ScanMode = (typeof SCAN_MODES)[number]
export type VerbosityLevel = (typeof VERBOSITY_LEVELS)[number]
export type ServiceTier = (typeof SERVICE_TIERS)[number]
export type ThinkingLevel = (typeof THINKING_LEVELS)[number]
export type DesktopPlatform = 'win32' | 'darwin' | 'linux'

/** A user-defined or built-in system prompt used to instruct the AI during scans. */
export interface SystemPrompt {
  id: string
  name: string
  text: string
  isBuiltIn: boolean
  type?: 'text' | 'image' | undefined
}

/** Describes an available AI model with its capabilities and reasoning variants. */
export interface AiModel {
  id: string
  displayName: string
  description: string
  isDefault: boolean
  supportsThinking: boolean
  thinkingVariants: { value: string; description: string }[]
}

/** Renderer-safe snapshot of the current ChatGPT authentication and model state. */
export interface ChatGptState {
  status: 'signed-out' | 'signing-in' | 'signed-in' | 'error'
  accountEmail: string | null
  limitLabel: string | null
  models: AiModel[]
  error?: string | null | undefined
}

/** Persisted application-wide user preferences including model and theme settings. */
export interface AppSettings {
  settingsRevision: 1
  uiLanguage: AppLocale
  theme: ThemeMode
  timeFormat: TimeFormat
  chatGptModel: string
  chatGptThinkingLevel: ThinkingLevel
  chatGptVerbosity: VerbosityLevel
  chatGptServiceTier: ServiceTier
  textModel: string
  textThinkingLevel: ThinkingLevel
  imageModel: string
  imageThinkingLevel: ThinkingLevel
  textSystemPromptPreset: string
  textCustomSystemPrompt: string
  imageSystemPromptPreset: string
  imageCustomSystemPrompt: string
  systemPrompts: SystemPrompt[]
  compactMode: boolean
  alwaysOnTop: boolean
  autoUpdate: boolean
  logLevel: LogLevel
}

export type AppSettingsPatch = Partial<Omit<AppSettings, 'settingsRevision'>>

export const DEFAULT_SETTINGS: AppSettings = {
  settingsRevision: 1,
  uiLanguage: 'en',
  theme: 'system',
  timeFormat: '24-hour',
  chatGptModel: '',
  chatGptThinkingLevel: 'low',
  chatGptVerbosity: 'low',
  chatGptServiceTier: 'normal',
  textModel: '',
  textThinkingLevel: 'low',
  imageModel: '',
  imageThinkingLevel: 'low',
  textSystemPromptPreset: 'text-solver',
  textCustomSystemPrompt: '',
  imageSystemPromptPreset: 'image-solver',
  imageCustomSystemPrompt: '',
  systemPrompts: [
    {
      id: 'text-solver',
      name: 'Solver',
      text: 'You are a careful problem solver. Read the selected content, solve accurately, and give the final answer clearly.',
      isBuiltIn: true,
      type: 'text',
    },
    {
      id: 'image-solver',
      name: 'Solver',
      text: 'You are a careful image problem solver. Analyze the selected image area, solve math accurately, interpret charts, diagrams, UI, or other image content when present, and give the key answer concisely and clearly.',
      isBuiltIn: true,
      type: 'image',
    },
  ],
  compactMode: false,
  alwaysOnTop: false,
  autoUpdate: true,
  logLevel: 'info',
}

/** A single AI scan result stored within a session. */
export interface SessionItem {
  id: string
  scanMode: ScanMode
  provider: string
  model: string
  thinkingLevel: string
  verbosity: VerbosityLevel
  systemPromptPreset: string
  systemPromptText: string
  input: string
  output: string
  imageDataUrl?: string | undefined
  createdAt: string
}

/** A complete session document containing zero or one scan results. */
export interface SessionDocument {
  id: string
  title: string
  isDefaultTitle: boolean
  createdAt: string
  updatedAt: string
  item?: SessionItem | null | undefined
}

/** Lightweight session metadata shown in the sidebar list. */
export interface SessionSummary {
  id: string
  title: string
  isDefaultTitle: boolean
  createdAt: string
  updatedAt: string
  hasItem: boolean
  preview: string
}

/** Initial payload sent to the renderer on application startup. */
export interface BootstrapPayload {
  settings: AppSettings
  sessions: SessionSummary[]
  currentSession: SessionDocument
  chatGpt: ChatGptState
  platform: DesktopPlatform
  version: string
}

/** Request shape for initiating a text-based AI scan. */
export interface ScanTextRequest {
  text: string
  imageDataUrl?: string | undefined
  settings: AppSettings
}

/** Request shape for initiating an image-based AI scan. */
export interface ScanImageRequest {
  imageDataUrl: string
  text?: string | undefined
  settings: AppSettings
}

/** Streamed result event emitted during an ongoing AI scan. */
export interface AiResultEvent {
  sessionId: string
  itemId: string
  delta: string
  isComplete: boolean
  inputText?: string | undefined
}

/** Emitted whenever the session list or current session document changes. */
export interface SessionUpdatedEvent {
  sessions: SessionSummary[]
  currentSession?: SessionDocument | undefined
}

/** Error event forwarded from the main process to the renderer. */
export interface AppErrorEvent {
  context?: 'scan' | 'provider' | 'session' | undefined
  message: string
  recoverable: boolean
}

/** Auto-updater state change event. */
export interface UpdateStateEvent {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  version?: string
  percent?: number
  releaseNotes?: string
  message?: string
}

/** Log entry sent from the renderer process to the main process logger. */
export interface RendererLogEntry {
  level: LogLevel
  module: string
  message: string
  details?: string
}

/** Typed contract for the preload API exposed to the renderer via contextBridge. */
export interface AiHelperApi {
  bootstrap(): Promise<BootstrapPayload>
  saveSettings(patch: AppSettingsPatch): Promise<AppSettings>
  saveApiKey(apiKey: string): Promise<void>
  getApiKey(): Promise<string | null>
  deleteApiKey(): Promise<void>
  signInChatGpt(): Promise<void>
  signOutChatGpt(): Promise<ChatGptState>
  refreshChatGpt(): Promise<ChatGptState>
  requestScreenSelection(mode: ScanMode, repeat?: boolean): Promise<string>
  sendSelection(result: { left: number; top: number; width: number; height: number }): void
  captureScreen(box: { left: number; top: number; width: number; height: number }): Promise<string>
  scanText(request: ScanTextRequest): Promise<SessionItem>
  scanImage(request: ScanImageRequest): Promise<SessionItem>
  cancelScan(): Promise<void>
  listSessions(): Promise<SessionSummary[]>
  createSession(): Promise<SessionDocument>
  renameSession(id: string, title: string): Promise<SessionDocument>
  getSession(id: string): Promise<SessionDocument>
  deleteSession(id: string): Promise<SessionSummary[]>
  deleteAllSessions(): Promise<SessionSummary[]>
  exportSession(id: string | null, format: ExportFormat): Promise<boolean>
  fetchModels(): Promise<AiModel[]>
  setAlwaysOnTop(enabled: boolean): Promise<void>
  setTheme(theme: Exclude<ThemeMode, 'system'>): Promise<void>
  openExternal(url: string): Promise<void>
  openLogsDirectory(): Promise<void>
  writeLog(entry: RendererLogEntry): void
  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>
  onAiResult(listener: (event: AiResultEvent) => void): () => void
  onSessionUpdated(listener: (event: SessionUpdatedEvent) => void): () => void
  onChatGptState(listener: (event: ChatGptState) => void): () => void
  onError(listener: (event: AppErrorEvent) => void): () => void
  onUpdateState(listener: (event: UpdateStateEvent) => void): () => void
  onShortcut(listener: (shortcut: string) => void): () => void
}
