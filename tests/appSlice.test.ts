/**
 * Verifies the Redux appSlice reducer: initial state, hydration guard,
 * settings update, page / settings-section navigation, ChatGPT state,
 * session CRUD operations, scan lifecycle (start / append / complete /
 * cancel), pending image and input text, update state events, sidebar
 * toggle, and compact mode.
 */

import { describe, expect, it } from 'vitest'
import reducer, {
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
  type AppState,
} from '../src/renderer/src/store/appSlice'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type SessionDocument,
  type SessionSummary,
} from '../src/shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid SessionDocument used across session tests. */
const sessionDoc = (overrides: Partial<SessionDocument> = {}): SessionDocument => ({
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  title: 'Test Session',
  isDefaultTitle: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:30:00.000Z',
  item: null,
  ...overrides,
})

const sessionSummary = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  title: 'Test Session',
  isDefaultTitle: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:30:00.000Z',
  hasItem: false,
  preview: 'Test Session',
  ...overrides,
})

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('appSlice – initial state', () => {
  it('starts uninitialized with the home page and default settings', () => {
    const state = reducer(undefined, { type: '@@INIT' })

    expect(state.initialized).toBe(false)
    expect(state.page).toBe('home')
    expect(state.settingsSection).toBe('general')
    expect(state.settings).toEqual(DEFAULT_SETTINGS)
    expect(state.platform).toBe('win32')
    expect(state.version).toBe('0.0.0')
    expect(state.scanState).toBe('idle')
    expect(state.scanOutput).toBe('')
    expect(state.pendingImage).toBeNull()
    expect(state.pendingInputText).toBeNull()
    expect(state.pendingScanMode).toBeNull()
    expect(state.sessionsSidebarOpen).toBe(true)
    expect(state.compactMode).toBe(false)
  })

  it('starts with default chatGpt state (signed-out, no models)', () => {
    const state = reducer(undefined, { type: '@@INIT' })

    expect(state.chatGpt.status).toBe('signed-out')
    expect(state.chatGpt.accountEmail).toBe('')
    expect(state.chatGpt.limitLabel).toBe('')
    expect(state.chatGpt.models).toEqual([])
  })

  it('starts with an empty session list and no current session', () => {
    const state = reducer(undefined, { type: '@@INIT' })

    expect(state.sessions).toEqual([])
    expect(state.currentSession).toBeNull()
  })

  it('starts with idle update state', () => {
    const state = reducer(undefined, { type: '@@INIT' })

    expect(state.update.state).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// hydrate
// ---------------------------------------------------------------------------

describe('appSlice – hydrate', () => {
  it('sets all state from a bootstrap payload', () => {
    const settings: AppSettings = { ...DEFAULT_SETTINGS, theme: 'dark' }
    const summaries: SessionSummary[] = [sessionSummary()]
    const current = sessionDoc()

    const state = reducer(
      undefined,
      hydrate({
        settings,
        platform: 'darwin',
        version: '1.2.0',
        chatGpt: {
          status: 'signed-in',
          accountEmail: 'u@test.com',
          limitLabel: '5% used',
          usageWindows: [],
          models: [],
        },
        sessions: summaries,
        currentSession: current,
      }),
    )

    expect(state.initialized).toBe(true)
    expect(state.settings.theme).toBe('dark')
    expect(state.platform).toBe('darwin')
    expect(state.version).toBe('1.2.0')
    expect(state.chatGpt.status).toBe('signed-in')
    expect(state.chatGpt.accountEmail).toBe('u@test.com')
    expect(state.sessions).toHaveLength(1)
    expect(state.currentSession).toEqual(current)
  })

  it('does not overwrite state when already initialized', () => {
    const preloaded = reducer(
      undefined,
      hydrate({
        settings: DEFAULT_SETTINGS,
        platform: 'linux',
        version: '1.0.0',
        chatGpt: {
          status: 'signed-out',
          accountEmail: '',
          limitLabel: '',
          usageWindows: [],
          models: [],
        },
        sessions: [],
        currentSession: sessionDoc({ id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' }),
      }),
    )
    expect(preloaded.initialized).toBe(true)

    // Second hydrate call with different data
    const second = reducer(
      preloaded,
      hydrate({
        settings: { ...DEFAULT_SETTINGS, theme: 'light' },
        platform: 'win32',
        version: '2.0.0',
        chatGpt: {
          status: 'signed-in',
          accountEmail: 'x@test.com',
          limitLabel: '',
          usageWindows: [],
          models: [],
        },
        sessions: [],
        currentSession: sessionDoc({ id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc' }),
      }),
    )

    // Should have the preloaded values, not the second payload
    expect(second.platform).toBe('linux')
    expect(second.version).toBe('1.0.0')
    expect(second.chatGpt.status).toBe('signed-out')
  })
})

// ---------------------------------------------------------------------------
// Page & settings section navigation
// ---------------------------------------------------------------------------

describe('appSlice – navigation', () => {
  it('setPage switches the top-level page', () => {
    const state = reducer(undefined, setPage('settings'))

    expect(state.page).toBe('settings')

    const back = reducer(state, setPage('home'))
    expect(back.page).toBe('home')
  })

  it('setSettingsSection selects a settings category', () => {
    const state = reducer(undefined, setSettingsSection('provider'))

    expect(state.settingsSection).toBe('provider')

    const changed = reducer(state, setSettingsSection('prompts'))
    expect(changed.settingsSection).toBe('prompts')
  })
})

// ---------------------------------------------------------------------------
// setSettings
// ---------------------------------------------------------------------------

describe('appSlice – setSettings', () => {
  it('replaces the entire settings object', () => {
    const newSettings: AppSettings = { ...DEFAULT_SETTINGS, theme: 'light', compactMode: true }

    const state = reducer(undefined, setSettings(newSettings))

    expect(state.settings.theme).toBe('light')
    expect(state.settings.compactMode).toBe(true)
    // Other defaults preserved inside the replacement
    expect(state.settings.uiLanguage).toBe('en')
  })
})

// ---------------------------------------------------------------------------
// setChatGptState
// ---------------------------------------------------------------------------

describe('appSlice – setChatGptState', () => {
  it('replaces the chatGpt state block', () => {
    const state = reducer(
      undefined,
      setChatGptState({
        status: 'signed-in',
        accountEmail: 'user@example.com',
        limitLabel: '80% used',
        usageWindows: [],
        models: [
          {
            id: 'gpt-5.1',
            displayName: 'GPT-5.1',
            description: '',
            isDefault: true,
            supportsThinking: true,
            thinkingVariants: [],
          },
        ],
      }),
    )

    expect(state.chatGpt.status).toBe('signed-in')
    expect(state.chatGpt.accountEmail).toBe('user@example.com')
    expect(state.chatGpt.limitLabel).toBe('80% used')
    expect(state.chatGpt.models).toHaveLength(1)
    expect(state.chatGpt.models[0]!.id).toBe('gpt-5.1')
  })
})

// ---------------------------------------------------------------------------
// setSessions / setCurrentSession
// ---------------------------------------------------------------------------

describe('appSlice – sessions', () => {
  it('setSessions replaces the session summary list', () => {
    const summaries: SessionSummary[] = [
      sessionSummary({ id: '1', title: 'One' }),
      sessionSummary({ id: '2', title: 'Two' }),
    ]

    const state = reducer(undefined, setSessions(summaries))

    expect(state.sessions).toHaveLength(2)
    expect(state.sessions[0]!.title).toBe('One')
  })

  it('setCurrentSession sets the active session and clears scan output', () => {
    const doc = sessionDoc({ id: 'active' })

    // Start with some leftover output
    let state = reducer(undefined, appendScanOutput('leftover'))
    expect(state.scanOutput).toBe('leftover')

    state = reducer(state, setCurrentSession(doc))

    expect(state.currentSession).toEqual(doc)
    expect(state.scanOutput).toBe('')
  })

  it('setCurrentSession accepts null to clear the session', () => {
    let state = reducer(undefined, setCurrentSession(sessionDoc()))
    state = reducer(state, setCurrentSession(null))

    expect(state.currentSession).toBeNull()
  })

  it('clears pendingImage when the new session has an image item', () => {
    const doc = sessionDoc({
      id: 'with-image',
      item: {
        id: 'item-1',
        scanMode: 'image',
        provider: 'chatgpt',
        model: 'gpt-5.1',
        thinkingLevel: 'low',
        verbosity: 'low',
        systemPromptPreset: 'image-solver',
        systemPromptText: '',
        input: '',
        output: '',
        imageDataUrl: 'data:image/png;base64,abc123',
        createdAt: '2026-08-01T10:00:00.000Z',
      },
    })

    let state = reducer(undefined, setPendingImage('data:image/png;base64,xyz'))
    expect(state.pendingImage).not.toBeNull()

    state = reducer(state, setCurrentSession(doc))

    // Session now owns the image, pendingImage should be cleared
    expect(state.pendingImage).toBeNull()
    expect(state.pendingScanMode).toBe('image')
  })

  it('clears pendingImage when switching to a different session without an image', () => {
    let state = reducer(undefined, setCurrentSession(sessionDoc({ id: 'first' })))
    state = reducer(state, setPendingImage('data:image/png;base64,temp'))

    // Switch to a different session with no item
    state = reducer(state, setCurrentSession(sessionDoc({ id: 'second' })))

    expect(state.pendingImage).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Pending image / input text
// ---------------------------------------------------------------------------

describe('appSlice – pending image & input', () => {
  it('setPendingImage stores a data URL', () => {
    const state = reducer(undefined, setPendingImage('data:image/png;base64,foo'))

    expect(state.pendingImage).toBe('data:image/png;base64,foo')
  })

  it('setPendingImage accepts null to clear', () => {
    let state = reducer(undefined, setPendingImage('data:image/png;base64,foo'))
    state = reducer(state, setPendingImage(null))

    expect(state.pendingImage).toBeNull()
  })

  it('setPendingInputText stores the input text', () => {
    const state = reducer(undefined, setPendingInputText('User typed this'))

    expect(state.pendingInputText).toBe('User typed this')
  })

  it('setPendingInputText accepts null', () => {
    let state = reducer(undefined, setPendingInputText('something'))
    state = reducer(state, setPendingInputText(null))

    expect(state.pendingInputText).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Scan lifecycle
// ---------------------------------------------------------------------------

describe('appSlice – scan lifecycle', () => {
  it('startScan sets scanning state and clears pending data', () => {
    let state = reducer(undefined, setPendingImage('data:image/png;base64,img'))
    state = reducer(state, setPendingInputText('some text'))
    state = reducer(state, appendScanOutput('old output'))

    state = reducer(state, startScan({ mode: 'text' }))

    expect(state.scanState).toBe('scanning')
    expect(state.scanOutput).toBe('')
    expect(state.pendingImage).toBeNull()
    expect(state.pendingInputText).toBeNull()
    expect(state.pendingScanMode).toBe('text')
  })

  it('startScan records image mode', () => {
    const state = reducer(undefined, startScan({ mode: 'image' }))

    expect(state.scanState).toBe('scanning')
    expect(state.pendingScanMode).toBe('image')
  })

  it('appendScanOutput concatenates streaming deltas', () => {
    let state = reducer(undefined, appendScanOutput('Hello'))
    state = reducer(state, appendScanOutput(' World'))
    state = reducer(state, appendScanOutput('!'))

    expect(state.scanOutput).toBe('Hello World!')
  })

  it('completeScan moves back to idle', () => {
    let state = reducer(undefined, startScan({ mode: 'text' }))
    expect(state.scanState).toBe('scanning')

    state = reducer(state, completeScan())
    expect(state.scanState).toBe('idle')
  })

  it('cancelScan sets the cancelling state', () => {
    let state = reducer(undefined, startScan({ mode: 'text' }))
    state = reducer(state, cancelScan())

    expect(state.scanState).toBe('cancelling')
  })
})

// ---------------------------------------------------------------------------
// setUpdateState
// ---------------------------------------------------------------------------

describe('appSlice – setUpdateState', () => {
  it('replaces the update state event', () => {
    const state = reducer(
      undefined,
      setUpdateState({
        state: 'downloading',
        version: '1.3.0',
        percent: 45,
      }),
    )

    expect(state.update.state).toBe('downloading')
    expect(state.update.version).toBe('1.3.0')
    expect(state.update.percent).toBe(45)
  })
})

// ---------------------------------------------------------------------------
// Sidebar & compact mode toggles
// ---------------------------------------------------------------------------

describe('appSlice – UI toggles', () => {
  it('setSessionsSidebarOpen toggles the sidebar', () => {
    const state = reducer(undefined, setSessionsSidebarOpen(false))

    expect(state.sessionsSidebarOpen).toBe(false)

    const reopened = reducer(state, setSessionsSidebarOpen(true))
    expect(reopened.sessionsSidebarOpen).toBe(true)
  })

  it('setCompactMode toggles compact mode', () => {
    const state = reducer(undefined, setCompactMode(true))

    expect(state.compactMode).toBe(true)

    const disabled = reducer(state, setCompactMode(false))
    expect(disabled.compactMode).toBe(false)
  })
})
