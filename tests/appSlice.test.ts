/**
 * Tests the application Redux slice including settings, sessions, scan state, and update events.
 */

import { describe, expect, it } from 'vitest'
import appReducer, {
  appendScanOutput,
  cancelScan,
  completeScan,
  hydrate,
  setChatGptState,
  setCompactMode,
  setCurrentSession,
  setPage,
  setPendingImage,
  setPendingInputText,
  setSessions,
  setSessionsSidebarOpen,
  setSettings,
  setSettingsSection,
  setUpdateState,
  startScan,
} from '../src/renderer/src/store/appSlice'
import {
  DEFAULT_SETTINGS,
  type BootstrapPayload,
  type SessionDocument,
  type SessionSummary,
} from '@shared/types'

describe('appSlice', () => {
  const basePayload: BootstrapPayload = {
    settings: DEFAULT_SETTINGS,
    sessions: [],
    currentSession: {
      id: 'session-1',
      title: 'New Session',
      isDefaultTitle: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      item: null,
    },
    chatGpt: {
      status: 'signed-out',
      accountEmail: '',
      limitLabel: '',
      models: [],
    },
    platform: 'win32',
    version: '1.0.0',
  }

  it('starts in uninitialized state', () => {
    const state = appReducer(undefined, { type: '@@INIT' })
    expect(state.initialized).toBe(false)
    expect(state.page).toBe('home')
    expect(state.scanState).toBe('idle')
  })

  it('hydrates once and ignores subsequent hydrations', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(state, hydrate(basePayload))
    expect(state.initialized).toBe(true)
    expect(state.settings.uiLanguage).toBe('en')
    expect(state.platform).toBe('win32')
    expect(state.version).toBe('1.0.0')

    const secondPayload = { ...basePayload, version: '2.0.0' }
    state = appReducer(state, hydrate(secondPayload))
    expect(state.version).toBe('1.0.0')
  })

  it('sets the current page', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(state, setPage('settings'))
    expect(state.page).toBe('settings')
    state = appReducer(state, setPage('home'))
    expect(state.page).toBe('home')
  })

  it('sets the settings section', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(state, setSettingsSection('provider'))
    expect(state.settingsSection).toBe('provider')
  })

  it('updates settings', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    const updated = { ...DEFAULT_SETTINGS, compactMode: true }
    state = appReducer(state, setSettings(updated))
    expect(state.settings.compactMode).toBe(true)
  })

  it('updates ChatGPT state', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(
      state,
      setChatGptState({
        status: 'signed-in',
        accountEmail: 'test@test.com',
        limitLabel: 'Pro · 25% used',
        models: [],
      }),
    )
    expect(state.chatGpt.status).toBe('signed-in')
    expect(state.chatGpt.accountEmail).toBe('test@test.com')
    expect(state.chatGpt.limitLabel).toBe('Pro · 25% used')
  })

  it('replaces session summaries', () => {
    const summaries: SessionSummary[] = [
      {
        id: 's1',
        title: 'Session 1',
        isDefaultTitle: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        hasItem: true,
        preview: 'Hello',
      },
    ]
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(state, setSessions(summaries))
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0]?.title).toBe('Session 1')
  })

  it('sets the current session and clears scan output', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer({ ...state, scanOutput: 'old output' }, { type: '@@INIT' })
    const doc: SessionDocument = {
      id: 'session-2',
      title: 'Session 2',
      isDefaultTitle: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      item: null,
    }
    state = appReducer(state, setCurrentSession(doc))
    expect(state.currentSession?.id).toBe('session-2')
    expect(state.scanOutput).toBe('')
    expect(state.pendingImage).toBeNull()
  })

  it('sets pending image', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(state, setPendingImage('data:image/png;base64,abc'))
    expect(state.pendingImage).toBe('data:image/png;base64,abc')
  })

  it('sets pending input text', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(state, setPendingInputText('Hello world'))
    expect(state.pendingInputText).toBe('Hello world')
  })

  it('starts a scan and clears output/pending state', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(
      { ...state, pendingImage: 'data:', pendingInputText: 'old', scanOutput: 'old output' },
      startScan({ mode: 'text' }),
    )
    expect(state.scanState).toBe('scanning')
    expect(state.scanOutput).toBe('')
    expect(state.pendingImage).toBeNull()
    expect(state.pendingInputText).toBeNull()
    expect(state.pendingScanMode).toBe('text')
  })

  it('appends scan output deltas', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(state, appendScanOutput('Hello '))
    state = appReducer(state, appendScanOutput('World'))
    expect(state.scanOutput).toBe('Hello World')
  })

  it('completes a scan', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer({ ...state, scanState: 'scanning' }, completeScan())
    expect(state.scanState).toBe('idle')
  })

  it('cancels a scan', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer({ ...state, scanState: 'scanning' }, cancelScan())
    expect(state.scanState).toBe('cancelling')
  })

  it('sets update state', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    state = appReducer(state, setUpdateState({ state: 'checking' }))
    expect(state.update.state).toBe('checking')
  })

  it('toggles sessions sidebar', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    expect(state.sessionsSidebarOpen).toBe(true)
    state = appReducer(state, setSessionsSidebarOpen(false))
    expect(state.sessionsSidebarOpen).toBe(false)
  })

  it('toggles compact mode', () => {
    let state = appReducer(undefined, { type: '@@INIT' })
    expect(state.compactMode).toBe(false)
    state = appReducer(state, setCompactMode(true))
    expect(state.compactMode).toBe(true)
  })
})
