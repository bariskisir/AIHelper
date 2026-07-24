/**
 * Verifies StorageService behaviour by mocking `fs/promises` with an
 * in-memory file store.  Covers createSession, getSession, setSessionItem,
 * renameSession, deleteSession (with the empty-list guard), deleteAllSessions,
 * and listSessions sort order.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SessionDocument, SessionItem, SessionSummary } from '../src/shared/types'

// ---------------------------------------------------------------------------
// In-memory filesystem shared by all fs/promises mocks
// ---------------------------------------------------------------------------
const fileStore = new Map<string, string>()

/** Normalises a filesystem path to forward slashes for cross-platform prefix matching. */
const toPosix = (p: string): string => p.replace(/\\/g, '/')

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(async (filePath: string) => {
    const content = fileStore.get(filePath)
    if (content === undefined) {
      const err = Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' })
      throw err
    }
    return content
  }),
  readdir: vi.fn(async (dirPath: string) => {
    const prefix = toPosix(dirPath).replace(/\/?$/, '/')
    const entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }> = []
    for (const [rawKey] of fileStore) {
      const key = toPosix(rawKey)
      if (key.startsWith(prefix)) {
        const name = key.slice(prefix.length)
        entries.push({
          name,
          isFile: () => name.endsWith('.json'),
          isDirectory: () => false,
        })
      }
    }
    return entries
  }),
  unlink: vi.fn(async (filePath: string) => {
    fileStore.delete(filePath)
  }),
  writeFile: vi.fn(async (filePath: string, content: string) => {
    fileStore.set(filePath, content)
  }),
}))

// Deterministic UUIDs so assertions can reference stable IDs
let uuidCounter = 0
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => {
    uuidCounter += 1
    return `00000000-0000-4000-a000-${String(uuidCounter).padStart(12, '0')}`
  }),
}))

import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import StorageService from '../src/main/services/StorageService'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = '/test-root'

/** Create a fresh StorageService and reset the shared in-memory store. */
const newService = (): StorageService => {
  fileStore.clear()
  uuidCounter = 0
  return new StorageService(ROOT)
}

const sessionPath = (id: string): string => join(ROOT, 'sessions', `${id}.json`)

/** Minimal valid SessionItem for setSessionItem tests. */
const sampleItem = (overrides: Partial<SessionItem> = {}): SessionItem => ({
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  scanMode: 'text',
  provider: 'chatgpt',
  model: 'gpt-5.1',
  thinkingLevel: 'low',
  verbosity: 'low',
  systemPromptPreset: 'text-solver',
  systemPromptText: 'Be helpful.',
  input: 'Hello world',
  output: 'Hello there',
  createdAt: new Date().toISOString(),
  ...overrides,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorageService', () => {
  beforeEach(() => {
    fileStore.clear()
    uuidCounter = 0
  })

  // -- createSession --------------------------------------------------------

  describe('createSession', () => {
    it('creates a session with expected default fields', async () => {
      const svc = newService()
      const doc = await svc.createSession()

      expect(doc.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
      expect(doc.title).toBe('New Session')
      expect(doc.isDefaultTitle).toBe(true)
      expect(doc.createdAt).toBe(doc.updatedAt)
      expect(doc.item).toBeNull()
      // Must be a valid ISO date string
      expect(() => new Date(doc.createdAt)).not.toThrow()
    })

    it('persists the session document to the sessions directory', async () => {
      const svc = newService()
      const doc = await svc.createSession()

      const raw = fileStore.get(sessionPath(doc.id))
      expect(raw).toBeDefined()

      const parsed: SessionDocument = JSON.parse(raw!)
      expect(parsed.id).toBe(doc.id)
      expect(parsed.title).toBe('New Session')
    })
  })

  // -- getSession -----------------------------------------------------------

  describe('getSession', () => {
    it('returns the correct session document', async () => {
      const svc = newService()
      const created = await svc.createSession()
      const fetched = await svc.getSession(created.id)

      expect(fetched.id).toBe(created.id)
      expect(fetched.title).toBe(created.title)
      expect(fetched.isDefaultTitle).toBe(true)
    })

    it('throws when the session id is not a valid UUID', async () => {
      const svc = newService()
      await expect(svc.getSession('not-a-uuid')).rejects.toThrow('Invalid session identifier')
    })

    it('propagates file-system errors for missing sessions', async () => {
      const svc = newService()
      // This UUID was never created, so readFile will throw ENOENT
      await expect(svc.getSession('11111111-1111-4111-8111-111111111111')).rejects.toThrow()
    })
  })

  // -- setSessionItem -------------------------------------------------------

  describe('setSessionItem', () => {
    it('updates the session with a scan item', async () => {
      const svc = newService()
      const created = await svc.createSession()
      const item = sampleItem()

      const updated = await svc.setSessionItem(created.id, item)

      expect(updated.item).toBeDefined()
      expect(updated.item!.id).toBe(item.id)
      expect(updated.item!.input).toBe('Hello world')
      expect(updated.item!.output).toBe('Hello there')
      expect(updated.item!.scanMode).toBe('text')
    })

    it('bumps updatedAt when setting an item', async () => {
      const svc = newService()
      const created = await svc.createSession()
      const originalUpdatedAt = created.updatedAt

      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 5))

      const updated = await svc.setSessionItem(created.id, sampleItem())
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime(),
      )
    })
  })

  // -- renameSession --------------------------------------------------------

  describe('renameSession', () => {
    it('changes the session title and clears the default-title flag', async () => {
      const svc = newService()
      const created = await svc.createSession()

      const renamed = await svc.renameSession(created.id, 'My Analysis')

      expect(renamed.title).toBe('My Analysis')
      expect(renamed.isDefaultTitle).toBe(false)
      expect(renamed.id).toBe(created.id)
    })

    it('trims whitespace from the title', async () => {
      const svc = newService()
      const created = await svc.createSession()

      const renamed = await svc.renameSession(created.id, '   Trimmed Title   ')
      expect(renamed.title).toBe('Trimmed Title')
    })

    it('throws when the title is empty or whitespace-only', async () => {
      const svc = newService()
      const created = await svc.createSession()

      await expect(svc.renameSession(created.id, '')).rejects.toThrow(
        'Session title cannot be empty.',
      )
      await expect(svc.renameSession(created.id, '   ')).rejects.toThrow(
        'Session title cannot be empty.',
      )
    })
  })

  // -- deleteSession --------------------------------------------------------

  describe('deleteSession', () => {
    it('removes the session and returns the remaining list', async () => {
      const svc = newService()
      const first = await svc.createSession()
      const second = await svc.createSession()

      const list = await svc.deleteSession(first.id)

      expect(list).toHaveLength(1)
      expect(list[0]!.id).toBe(second.id)
    })

    it('creates a fresh empty session when the last session is deleted', async () => {
      const svc = newService()
      const only = await svc.createSession()

      const list = await svc.deleteSession(only.id)

      expect(list).toHaveLength(1)
      expect(list[0]!.id).not.toBe(only.id)
      expect(list[0]!.title).toBe('New Session')
    })

    it('does not throw when deleting a non-existent session', async () => {
      const svc = newService()
      await svc.createSession() // ensure at least one exists

      // Deleting a session that was never created should not explode
      await expect(svc.deleteSession('22222222-2222-4222-8222-222222222222')).resolves.toBeDefined()
    })
  })

  // -- deleteAllSessions ----------------------------------------------------

  describe('deleteAllSessions', () => {
    it('removes every session and creates a single fresh one', async () => {
      const svc = newService()
      await svc.createSession()
      await svc.createSession()
      await svc.createSession()

      const list = await svc.deleteAllSessions()

      expect(list).toHaveLength(1)
      expect(list[0]!.title).toBe('New Session')
      expect(list[0]!.isDefaultTitle).toBe(true)
    })
  })

  // -- listSessions ---------------------------------------------------------

  describe('listSessions', () => {
    it('returns an empty array when no sessions exist', async () => {
      const svc = newService()
      // Don't create any session — ensure the directory is empty
      vi.mocked(readdir).mockResolvedValueOnce([] as any)

      const list = await svc.listSessions()
      expect(list).toEqual([])
    })

    it('returns a summary for each stored session', async () => {
      const svc = newService()
      const first = await svc.createSession()
      const second = await svc.createSession()

      const list = await svc.listSessions()

      expect(list).toHaveLength(2)
      const ids = list.map((s) => s.id)
      expect(ids).toContain(first.id)
      expect(ids).toContain(second.id)
    })

    it('annotates summaries with hasItem and a preview', async () => {
      const svc = newService()
      const created = await svc.createSession()
      await svc.setSessionItem(created.id, sampleItem({ input: 'Solve this math problem: 2+2' }))

      const list = await svc.listSessions()
      const summary = list.find((s) => s.id === created.id)

      expect(summary).toBeDefined()
      expect(summary!.hasItem).toBe(true)
      expect(summary!.preview).toContain('Solve this math problem')
    })

    it('returns the title as preview when no item exists', async () => {
      const svc = newService()
      const created = await svc.createSession()
      await svc.renameSession(created.id, 'Physics Homework')

      const list = await svc.listSessions()
      const summary = list.find((s) => s.id === created.id)

      expect(summary).toBeDefined()
      expect(summary!.hasItem).toBe(false)
      // preview falls back to title when there is no item.input
      expect(summary!.preview).toBe('Physics Homework')
    })
  })
})
