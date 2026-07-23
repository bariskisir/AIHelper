/**
 * Tests the StorageService persistence layer using a real temporary directory.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import StorageService from '../src/main/services/StorageService'
import { type SessionItem } from '../src/shared/types'

describe('StorageService', () => {
  const testRoot = join(tmpdir(), `aihelper-test-${randomUUID()}`)
  let storage: StorageService

  beforeAll(async () => {
    await mkdir(testRoot, { recursive: true })
    storage = new StorageService(testRoot)
    await storage.initialize()
  })

  afterAll(async () => {
    await rm(testRoot, { recursive: true, force: true })
  })

  it('loads default settings when no settings file exists', async () => {
    const settings = await storage.loadSettings()
    expect(settings.settingsRevision).toBe(1)
    expect(settings.uiLanguage).toBe('en')
  })

  it('saves and reloads settings', async () => {
    const updated = await storage.updateSettings({ compactMode: true, alwaysOnTop: true })
    expect(updated.compactMode).toBe(true)
    expect(updated.alwaysOnTop).toBe(true)

    const loaded = await storage.loadSettings()
    expect(loaded.compactMode).toBe(true)
    expect(loaded.alwaysOnTop).toBe(true)
  })

  it('updates settings incrementally', async () => {
    await storage.updateSettings({ theme: 'dark' })
    const settings = await storage.loadSettings()
    expect(settings.theme).toBe('dark')
    expect(settings.compactMode).toBe(true)
  })

  it('creates a session with default title', async () => {
    const session = await storage.createSession()
    expect(session.id).toBeTruthy()
    expect(session.title).toBe('New Session')
    expect(session.isDefaultTitle).toBe(true)
  })

  it('lists sessions after creation', async () => {
    await storage.createSession()
    const sessions = await storage.listSessions()
    expect(sessions.length).toBeGreaterThan(0)
  })

  it('gets a session by ID', async () => {
    const session = await storage.createSession()
    const loaded = await storage.getSession(session.id)
    expect(loaded.id).toBe(session.id)
    expect(loaded.title).toBe('New Session')
  })

  it('renames a session', async () => {
    const session = await storage.createSession()
    const renamed = await storage.renameSession(session.id, 'My Renamed Session  ')
    expect(renamed.title).toBe('My Renamed Session')
    expect(renamed.isDefaultTitle).toBe(false)
  })

  it('sets a session item', async () => {
    const session = await storage.createSession()
    const item: SessionItem = {
      id: randomUUID(),
      scanMode: 'text',
      provider: 'chatgpt',
      model: 'gpt-5.6-luna',
      thinkingLevel: 'low',
      verbosity: 'low',
      systemPromptPreset: 'text-solver',
      systemPromptText: 'Solve problems.',
      input: 'What is 2+2?',
      output: '4',
      imageDataUrl: undefined,
      createdAt: new Date().toISOString(),
    }
    const doc = await storage.setSessionItem(session.id, item)
    expect(doc.item?.input).toBe('What is 2+2?')
    expect(doc.item?.output).toBe('4')
  })

  it('deletes a session', async () => {
    const session = await storage.createSession()
    await storage.deleteSession(session.id)
    const sessions = await storage.listSessions()
    const ids = sessions.map((s) => s.id)
    expect(ids).not.toContain(session.id)
  })

  it('always maintains at least one session after delete', async () => {
    const allSessions = await storage.listSessions()
    for (const s of allSessions) {
      await storage.deleteSession(s.id)
    }
    const remaining = await storage.listSessions()
    expect(remaining.length).toBeGreaterThanOrEqual(1)
  })

  it('deletes all sessions and creates a fresh one', async () => {
    await storage.createSession()
    const afterDelete = await storage.deleteAllSessions()
    expect(afterDelete.length).toBe(1)
    expect(afterDelete[0]?.title).toBe('New Session')
  })

  it('rejects invalid session IDs', async () => {
    await expect(storage.getSession('invalid-uuid')).rejects.toThrow()
    await expect(storage.renameSession('invalid', 'Title')).rejects.toThrow()
    await expect(storage.deleteSession('invalid')).rejects.toThrow()
  })

  it('updates last item output', async () => {
    const session = await storage.createSession()
    await storage.setSessionItem(session.id, {
      id: randomUUID(),
      scanMode: 'text',
      provider: 'chatgpt',
      model: 'gpt-5.6-luna',
      thinkingLevel: 'low',
      verbosity: 'low',
      systemPromptPreset: 'text-solver',
      systemPromptText: 'Solve',
      input: 'Hello',
      output: 'H',
      createdAt: new Date().toISOString(),
    })
    const doc = await storage.updateLastItemOutput(session.id, 'Hello World')
    expect(doc.item?.output).toBe('Hello World')
  })
})
