/**
 * Stores validated settings and AI scan sessions through serialized direct JSON file access.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AI_PROVIDERS,
  SCAN_MODES,
  THINKING_LEVELS,
  VERBOSITY_LEVELS,
  type AppSettings,
  type AppSettingsPatch,
  type SessionDocument,
  type SessionItem,
  type SessionSummary,
} from '@shared/types'
import { z } from 'zod'
import { parsePersistedSettings, settingsSchema } from '../settingsSchema'

const sessionItemSchema = z.object({
  id: z.uuid(),
  scanMode: z.enum(SCAN_MODES),
  provider: z.enum(AI_PROVIDERS),
  model: z.string().min(1).max(100),
  thinkingLevel: z.enum(THINKING_LEVELS),
  verbosity: z.enum(VERBOSITY_LEVELS),
  systemPromptPreset: z.string().max(100),
  systemPromptText: z.string().max(10_000),
  input: z.string().max(200_000),
  output: z.string().max(200_000),
  imagePath: z.string().max(500).optional(),
  /** Captured region as a PNG data URL — persisted so the renderer can show it after the scan ends. */
  imageDataUrl: z.string().max(50_000_000).optional(),
  createdAt: z.iso.datetime(),
})

const sessionDocumentSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  isDefaultTitle: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  item: sessionItemSchema.nullable().optional(),
})

const DEFAULT_SESSION_TITLE = 'New Session'

/** Rejects identifiers that could escape the session directory. */
const assertSessionId = (id: string): void => {
  if (!z.uuid().safeParse(id).success) throw new Error('Invalid session identifier.')
}

export default class StorageService {
  private readonly settingsPath: string
  private readonly historiesPath: string
  private readonly fileOperationTails = new Map<string, Promise<void>>()

  /** Creates a storage service rooted in the private application data directory. */
  public constructor(private readonly rootPath: string) {
    this.settingsPath = join(rootPath, 'settings.json')
    this.historiesPath = join(rootPath, 'histories')
  }

  /** Creates required directories and removes obsolete temporary files. */
  public async initialize(): Promise<void> {
    await mkdir(this.rootPath, { recursive: true })
    await mkdir(this.historiesPath, { recursive: true })
    await Promise.all([
      this.removeObsoleteTemporaryFiles(this.rootPath),
      this.removeObsoleteTemporaryFiles(this.historiesPath),
    ])
  }

  /** Loads validated settings or safe defaults for missing or malformed data. */
  public async loadSettings(): Promise<AppSettings> {
    return this.withFileLock(this.settingsPath, async () => {
      try {
        const content = await readFile(this.settingsPath, 'utf8')
        return parsePersistedSettings(JSON.parse(content) as unknown)
      } catch {
        return parsePersistedSettings(null)
      }
    })
  }

  /** Merges a validated settings patch with the latest on-disk settings atomically. */
  public async updateSettings(patch: AppSettingsPatch): Promise<AppSettings> {
    return this.withFileLock(this.settingsPath, async () => {
      const current = await this.loadSettingsUnlocked()
      const merged = settingsSchema.parse({ ...current, ...patch })
      await this.writeJsonFileUnlocked(this.settingsPath, merged)
      return merged
    })
  }

  /** Lists all saved sessions sorted by last update. */
  public async listSessions(): Promise<SessionSummary[]> {
    const entries = await readdir(this.historiesPath, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((left, right) => right.name.localeCompare(left.name))
    const summaries = await Promise.all(
      files.map(async (file) => {
        const doc = await this.tryReadSession(join(this.historiesPath, file.name))
        if (!doc) return null
        const preview = (doc.item?.input ?? '').slice(0, 120)
        const summary: SessionSummary = {
          id: doc.id,
          title: doc.title,
          isDefaultTitle: doc.isDefaultTitle,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          hasItem: !!doc.item,
          preview: preview || doc.title,
        }
        return summary
      }),
    )
    return summaries.filter((summary): summary is SessionSummary => summary !== null)
  }

  /** Creates a new empty session document. */
  public async createSession(): Promise<SessionDocument> {
    const now = new Date().toISOString()
    const document: SessionDocument = {
      id: randomUUID(),
      title: DEFAULT_SESSION_TITLE,
      isDefaultTitle: true,
      createdAt: now,
      updatedAt: now,
      item: null,
    }
    await this.writeSession(document)
    return document
  }

  /** Loads one complete session document. */
  public async getSession(id: string): Promise<SessionDocument> {
    assertSessionId(id)
    return this.withFileLock(this.sessionPath(id), () =>
      this.readSessionUnlocked(this.sessionPath(id)),
    )
  }

  /** Sets the single AI scan result item for the target session and persists it. */
  public async setSessionItem(id: string, item: SessionItem): Promise<SessionDocument> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    return this.withFileLock(filePath, async () => {
      const doc = await this.readSessionUnlocked(filePath)
      doc.item = item
      doc.updatedAt = new Date().toISOString()
      const validated = sessionDocumentSchema.parse(doc)
      await this.writeJsonFileUnlocked(filePath, validated)
      return validated
    })
  }

  /** Updates the output of the session item (for streaming completion). */
  public async updateLastItemOutput(id: string, output: string): Promise<SessionDocument> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    return this.withFileLock(filePath, async () => {
      const doc = await this.readSessionUnlocked(filePath)
      if (doc.item) {
        doc.item.output = output
      }
      doc.updatedAt = new Date().toISOString()
      const validated = sessionDocumentSchema.parse(doc)
      await this.writeJsonFileUnlocked(filePath, validated)
      return validated
    })
  }

  /** Renames one session document. */
  public async renameSession(id: string, title: string): Promise<SessionDocument> {
    assertSessionId(id)
    const normalizedTitle = title.trim().slice(0, 200)
    if (!normalizedTitle) throw new Error('Session title cannot be empty.')
    return this.updateSession(id, (doc) => {
      doc.title = normalizedTitle
      doc.isDefaultTitle = false
      doc.updatedAt = new Date().toISOString()
    })
  }

  /** Deletes all session documents and creates a fresh empty session. */
  public async deleteAllSessions(): Promise<SessionSummary[]> {
    const entries = await readdir(this.historiesPath, { withFileTypes: true })
    await Promise.allSettled(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) =>
          this.withFileLock(join(this.historiesPath, entry.name), async () => {
            try {
              await unlink(join(this.historiesPath, entry.name))
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            }
          }),
        ),
    )
    await this.createSession()
    return this.listSessions()
  }

  /** Deletes a session document, preserving at least one empty session. */
  public async deleteSession(id: string): Promise<SessionSummary[]> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    await this.withFileLock(filePath, async () => {
      try {
        await unlink(filePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })
    let list = await this.listSessions()
    if (list.length === 0) {
      await this.createSession()
      list = await this.listSessions()
    }
    return list
  }

  /** Reads one session while tolerating malformed entries. */
  private async tryReadSession(filePath: string): Promise<SessionDocument | null> {
    try {
      return await this.withFileLock(filePath, () => this.readSessionUnlocked(filePath))
    } catch {
      return null
    }
  }

  /** Applies one session mutation without allowing another operation to interleave. */
  private async updateSession(
    id: string,
    update: (doc: SessionDocument) => void,
  ): Promise<SessionDocument> {
    assertSessionId(id)
    const filePath = this.sessionPath(id)
    return this.withFileLock(filePath, async () => {
      const doc = await this.readSessionUnlocked(filePath)
      update(doc)
      const validated = sessionDocumentSchema.parse(doc)
      await this.writeJsonFileUnlocked(filePath, validated)
      return validated
    })
  }

  /** Validates and writes a complete session document. */
  private async writeSession(document: SessionDocument): Promise<void> {
    const validated = sessionDocumentSchema.parse(document)
    await this.writeJsonFile(this.sessionPath(validated.id), validated)
  }

  /** Reads a session while its caller owns the file-operation lock. */
  private async readSessionUnlocked(filePath: string): Promise<SessionDocument> {
    const value: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    return sessionDocumentSchema.parse(value)
  }

  /** Resolves a validated session identifier to its JSON file. */
  private sessionPath(id: string): string {
    return join(this.historiesPath, `${id}.json`)
  }

  /** Serializes and writes one JSON value directly to its destination file. */
  private async writeJsonFile(filePath: string, value: unknown): Promise<void> {
    await this.withFileLock(filePath, () => this.writeJsonFileUnlocked(filePath, value))
  }

  /** Writes one complete JSON payload while its caller owns the file-operation lock. */
  private async writeJsonFileUnlocked(filePath: string, value: unknown): Promise<void> {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  }

  /** Reads settings without file-locking (caller must hold the lock). */
  private async loadSettingsUnlocked(): Promise<AppSettings> {
    try {
      const content = await readFile(this.settingsPath, 'utf8')
      return parsePersistedSettings(JSON.parse(content) as unknown)
    } catch {
      return parsePersistedSettings(null)
    }
  }

  /** Runs one operation after every earlier operation targeting the same file. */
  private async withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.fileOperationTails.get(filePath) ?? Promise.resolve()
    let release = (): void => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.catch(() => undefined).then(() => gate)
    this.fileOperationTails.set(filePath, tail)
    await previous.catch(() => undefined)
    try {
      return await operation()
    } finally {
      release()
      if (this.fileOperationTails.get(filePath) === tail) this.fileOperationTails.delete(filePath)
    }
  }

  /** Removes only obsolete temporary files. */
  private async removeObsoleteTemporaryFiles(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true })
    await Promise.allSettled(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.tmp'))
        .map((entry) => unlink(join(directoryPath, entry.name))),
    )
  }
}
