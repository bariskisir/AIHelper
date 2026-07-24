/**
 * Exposes a typed, capability-limited IPC API to the sandboxed renderer.
 */

import { IpcChannel } from '@shared/IpcChannel'
import type {
  AiHelperApi,
  AiResultEvent,
  AppErrorEvent,
  ChatGptState,
  SessionUpdatedEvent,
  UpdateStateEvent,
} from '@shared/types'
import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'

/** Subscribes to one approved event and returns a cleanup callback. */
const subscribe = <T>(channel: string, listener: (payload: T) => void): (() => void) => {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: AiHelperApi = {
  /** Sends a screen selection result from the overlay window. */
  sendSelection: (result) => ipcRenderer.send('screen-selection', result),
  /** Requests the main process to open the fullscreen selection overlay. */
  requestScreenSelection: (mode, repeat) => ipcRenderer.invoke('screen:select', mode, repeat),
  /** Captures a screen region and returns it as a PNG data URL. */
  captureScreen: (box) => ipcRenderer.invoke('screen:capture', box),
  /** Loads persisted settings, sessions, and application metadata. */
  bootstrap: () => ipcRenderer.invoke(IpcChannel.AppBootstrap),
  /** Atomically merges validated application settings fields. */
  saveSettings: (patch) => ipcRenderer.invoke(IpcChannel.SettingsSave, patch),
  /** Validates, encrypts, and persists a provider API key. */
  saveApiKey: (apiKey) => ipcRenderer.invoke(IpcChannel.CredentialsSave, apiKey),
  /** Decrypts the saved API key for the explicit settings credential field. */
  getApiKey: () => ipcRenderer.invoke(IpcChannel.CredentialsGet),
  /** Removes the encrypted API key. */
  deleteApiKey: () => ipcRenderer.invoke(IpcChannel.CredentialsDelete),
  /** Initiates ChatGPT OAuth sign-in flow. */
  signInChatGpt: () => ipcRenderer.invoke('chatgpt:sign-in'),
  /** Signs out and clears ChatGPT tokens. */
  signOutChatGpt: () => ipcRenderer.invoke('chatgpt:sign-out'),
  /** Refreshes ChatGPT authentication and model state. */
  refreshChatGpt: () => ipcRenderer.invoke('chatgpt:refresh'),
  /** Starts a text-based AI scan. */
  scanText: (request) => ipcRenderer.invoke(IpcChannel.AiScanText, request),
  /** Starts an image-based AI scan. */
  scanImage: (request) => ipcRenderer.invoke(IpcChannel.AiScanImage, request),
  /** Cancels the currently running scan. */
  cancelScan: () => ipcRenderer.invoke(IpcChannel.AiCancel),
  /** Lists all session summaries. */
  listSessions: () => ipcRenderer.invoke(IpcChannel.SessionList),
  /** Creates a new empty session. */
  createSession: () => ipcRenderer.invoke(IpcChannel.SessionCreate),
  /** Renames a session. */
  renameSession: (id, title) => ipcRenderer.invoke(IpcChannel.SessionRename, id, title),
  /** Loads a complete session document. */
  getSession: (id) => ipcRenderer.invoke(IpcChannel.SessionGet, id),
  /** Deletes one session. */
  deleteSession: (id) => ipcRenderer.invoke(IpcChannel.SessionDelete, id),
  /** Deletes all sessions and returns remaining summaries. */
  deleteAllSessions: () => ipcRenderer.invoke(IpcChannel.SessionDeleteAll),
  /** Exports one or all sessions in the requested format. */
  exportSession: (id, format) => ipcRenderer.invoke(IpcChannel.SessionExport, id, format),
  /** Fetches available AI models. */
  fetchModels: () => ipcRenderer.invoke('models:fetch'),
  /** Changes the native always-on-top state. */
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke(IpcChannel.WindowAlwaysOnTop, enabled),
  /** Synchronizes native window chrome with the resolved renderer theme. */
  setTheme: (theme) => ipcRenderer.invoke(IpcChannel.ThemeSet, theme),
  /** Opens an allow-listed URL in the system browser. */
  openExternal: (url) => ipcRenderer.invoke(IpcChannel.ShellOpenExternal, url),
  /** Opens the application log directory in the system file manager. */
  openLogsDirectory: () => ipcRenderer.invoke(IpcChannel.LogsOpenDirectory),
  /** Persists one validated renderer diagnostic through the main logger. */
  writeLog: (entry) => ipcRenderer.send(IpcChannel.LogWrite, entry),
  /** Checks GitHub Releases for an application update. */
  checkForUpdates: () => ipcRenderer.invoke(IpcChannel.UpdatesCheck),
  /** Restarts and installs a downloaded update. */
  installUpdate: () => ipcRenderer.invoke(IpcChannel.UpdatesInstall),
  /** Subscribes to streaming AI scan results. */
  onAiResult: (listener) => subscribe<AiResultEvent>(IpcChannel.AiResult, listener),
  /** Subscribes to session list and document changes. */
  onSessionUpdated: (listener) =>
    subscribe<SessionUpdatedEvent>(IpcChannel.SessionUpdated, listener),
  /** Subscribes to ChatGPT authentication state changes. */
  onChatGptState: (listener) => subscribe<ChatGptState>(IpcChannel.ChatGptState, listener),
  /** Subscribes to recoverable application errors. */
  onError: (listener) => subscribe<AppErrorEvent>(IpcChannel.AppError, listener),
  /** Subscribes to updater lifecycle events. */
  onUpdateState: (listener) => subscribe<UpdateStateEvent>(IpcChannel.UpdateState, listener),
  /** Subscribes to global keyboard shortcuts. */
  onShortcut: (listener) => subscribe<string>('shortcut', listener),
}

contextBridge.exposeInMainWorld('app', api)
