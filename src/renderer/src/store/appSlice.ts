/**
 * Stores application settings, scan state, sessions, ChatGPT state, and update progress.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type BootstrapPayload,
  type ChatGptState,
  type SessionDocument,
  type SessionSummary,
  type UpdateStateEvent,
} from '@shared/types'

export type AppPage = 'home' | 'settings'
export type SettingsSection = 'general' | 'provider' | 'prompts' | 'updates' | 'about' | 'logging'

export interface AppState {
  initialized: boolean
  page: AppPage
  settingsSection: SettingsSection
  settings: AppSettings
  platform: BootstrapPayload['platform']
  version: string
  chatGpt: ChatGptState
  sessions: SessionSummary[]
  currentSession: SessionDocument | null
  scanState: 'idle' | 'scanning' | 'cancelling'
  scanOutput: string
  /** Image being scanned right now — shown in input before session updates. */
  pendingImage: string | null
  /** OCR or input text being scanned right now — shown in input before session updates. */
  pendingInputText: string | null
  /** Scan mode currently in progress, for rendering the input area. */
  pendingScanMode: 'text' | 'image' | null
  update: UpdateStateEvent
  sessionsSidebarOpen: boolean
  compactMode: boolean
}

const initialState: AppState = {
  initialized: false,
  page: 'home',
  settingsSection: 'general',
  settings: DEFAULT_SETTINGS,
  platform: 'win32',
  version: '0.0.0',
  chatGpt: {
    status: 'signed-out',
    accountEmail: '',
    limitLabel: '',
    models: [],
  },
  sessions: [],
  currentSession: null,
  scanState: 'idle',
  scanOutput: '',
  pendingImage: null,
  pendingInputText: null,
  pendingScanMode: null,
  update: { state: 'idle' },
  sessionsSidebarOpen: true,
  compactMode: false,
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    /** Hydrates the renderer with persisted main-process state. */
    hydrate(state, action: PayloadAction<BootstrapPayload>) {
      if (state.initialized) return
      state.initialized = true
      state.settings = action.payload.settings
      state.platform = action.payload.platform
      state.version = action.payload.version
      state.chatGpt = action.payload.chatGpt
      state.sessions = action.payload.sessions
      state.currentSession = action.payload.currentSession
    },
    /** Opens a top-level application page. */
    setPage(state, action: PayloadAction<AppPage>) {
      state.page = action.payload
    },
    /** Selects the settings category. */
    setSettingsSection(state, action: PayloadAction<SettingsSection>) {
      state.settingsSection = action.payload
    },
    /** Replaces settings after successful persistence. */
    setSettings(state, action: PayloadAction<AppSettings>) {
      state.settings = action.payload
    },
    /** Updates ChatGPT authentication and model state. */
    setChatGptState(state, action: PayloadAction<ChatGptState>) {
      state.chatGpt = action.payload
    },
    /** Replaces session summaries. */
    setSessions(state, action: PayloadAction<SessionSummary[]>) {
      state.sessions = action.payload
    },
    /** Sets the active session document. */
    setCurrentSession(state, action: PayloadAction<SessionDocument | null>) {
      const prevId = state.currentSession?.id
      const next = action.payload
      state.currentSession = next
      state.scanOutput = ''

      const latest = next?.item
      // Session now owns the image — drop the temporary pending copy.
      if (latest?.imageDataUrl) {
        state.pendingImage = null
        state.pendingScanMode = latest.scanMode
      } else if (prevId !== next?.id) {
        // User switched to a different session that has no image.
        state.pendingImage = null
        state.pendingScanMode = latest?.scanMode ?? null
      }
    },
    /** Set the image being scanned, shown in input immediately. */
    setPendingImage(state, action: PayloadAction<string | null>) {
      state.pendingImage = action.payload
    },
    /** Set the OCR or input text being scanned, shown in input immediately. */
    setPendingInputText(state, action: PayloadAction<string | null>) {
      state.pendingInputText = action.payload
    },
    /** Starts a scan, clears output, and records the scan mode. */
    startScan(state, action: PayloadAction<{ mode: 'text' | 'image' }>) {
      state.scanState = 'scanning'
      state.scanOutput = ''
      state.pendingImage = null
      state.pendingInputText = null
      state.pendingScanMode = action.payload.mode
    },
    /** Appends streaming delta to the scan output. */
    appendScanOutput(state, action: PayloadAction<string>) {
      state.scanOutput += action.payload
    },
    /** Marks the scan as complete. Keeps pending image/output until session arrives. */
    completeScan(state) {
      state.scanState = 'idle'
    },
    /** Marks the scan as cancelled. */
    cancelScan(state) {
      state.scanState = 'cancelling'
    },
    /** Applies desktop updater progress. */
    setUpdateState(state, action: PayloadAction<UpdateStateEvent>) {
      state.update = action.payload
    },
    /** Shows or hides the sessions sidebar. */
    setSessionsSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sessionsSidebarOpen = action.payload
    },
    /** Toggles compact mode. */
    setCompactMode(state, action: PayloadAction<boolean>) {
      state.compactMode = action.payload
    },
  },
})

export const {
  hydrate,
  setPage,
  setSettingsSection,
  setSettings,
  setChatGptState,
  setSessions,
  setCurrentSession,
  setPendingImage,
  setPendingInputText,
  startScan,
  appendScanOutput,
  completeScan,
  cancelScan,
  setUpdateState,
  setSessionsSidebarOpen,
  setCompactMode,
} = appSlice.actions

export default appSlice.reducer
