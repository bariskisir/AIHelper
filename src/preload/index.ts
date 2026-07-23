/**
 * Exposes a typed, capability-limited IPC API to the sandboxed renderer.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AiHelperApi,
  AiResultEvent,
  AppErrorEvent,
  ChatGptState,
  SessionUpdatedEvent,
  UpdateStateEvent,
} from '@shared/types'

/** Subscribes to an IPC channel event and returns an unsubscribe function. */
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

  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  saveApiKey: (apiKey) => ipcRenderer.invoke('credentials:save', apiKey),
  getApiKey: () => ipcRenderer.invoke('credentials:get'),
  deleteApiKey: () => ipcRenderer.invoke('credentials:delete'),
  signInChatGpt: () => ipcRenderer.invoke('chatgpt:sign-in'),
  signOutChatGpt: () => ipcRenderer.invoke('chatgpt:sign-out'),
  refreshChatGpt: () => ipcRenderer.invoke('chatgpt:refresh'),
  scanText: (request) => ipcRenderer.invoke('ai:scan-text', request),
  scanImage: (request) => ipcRenderer.invoke('ai:scan-image', request),
  cancelScan: () => ipcRenderer.invoke('ai:cancel'),
  listSessions: () => ipcRenderer.invoke('session:list'),
  createSession: () => ipcRenderer.invoke('session:create'),
  renameSession: (id, title) => ipcRenderer.invoke('session:rename', id, title),
  getSession: (id) => ipcRenderer.invoke('session:get', id),
  deleteSession: (id) => ipcRenderer.invoke('session:delete', id),
  deleteAllSessions: () => ipcRenderer.invoke('session:delete-all'),
  exportSession: (id, format) => ipcRenderer.invoke('session:export', id, format),
  fetchModels: () => ipcRenderer.invoke('models:fetch'),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('window:always-on-top', enabled),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openLogsDirectory: () => ipcRenderer.invoke('logs:open-directory'),
  writeLog: (entry) => ipcRenderer.send('logs:write', entry),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onAiResult: (listener) => subscribe<AiResultEvent>('event:ai-result', listener),
  onSessionUpdated: (listener) => subscribe<SessionUpdatedEvent>('event:session-updated', listener),
  onChatGptState: (listener) => subscribe<ChatGptState>('event:chatgpt-state', listener),
  onError: (listener) => subscribe<AppErrorEvent>('event:error', listener),
  onUpdateState: (listener) => subscribe<UpdateStateEvent>('event:update-state', listener),
  onShortcut: (listener) => subscribe<string>('shortcut', listener),
}

contextBridge.exposeInMainWorld('aihelper', api)
