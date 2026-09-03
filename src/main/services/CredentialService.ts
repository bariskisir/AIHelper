/**
 * Persists API keys and ChatGPT OAuth tokens as plain JSON.
 * Legacy encrypted `*.bin` files are migrated automatically on first read.
 */

import { readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { safeStorage } from 'electron'

export interface ChatGptAuthTokens {
  accessToken: string
  refreshToken: string
  accountId: string
  accountEmail: string
  expiresAt: number
}

export default class CredentialService {
  private get legacyFilePath(): string {
    return join(dirname(this.filePath), 'credentials.bin')
  }

  private chatGptPath(): string {
    return join(dirname(this.filePath), 'chatgpt_auth.json')
  }

  private get chatGptLegacyPath(): string {
    return join(dirname(this.filePath), 'chatgpt_auth.bin')
  }

  /** Creates a credential service for one vault file (now `credentials.json`). */
  public constructor(private readonly filePath: string) {}

  /** Reports whether an encrypted API key is stored. */
  public async hasApiKey(): Promise<boolean> {
    return Boolean(await this.getApiKey())
  }

  /** Reads API key from JSON, migrating legacy encrypted bin if needed. */
  public async getApiKey(): Promise<string | null> {
    const fromJson = await this.readApiKeyJson()
    if (fromJson !== null) return fromJson
    const migrated = await this.tryMigrateLegacyApiKey()
    return migrated
  }

  private async readApiKeyJson(): Promise<string | null> {
    try {
      const content = await readFile(this.filePath, 'utf8')
      const parsed: unknown = JSON.parse(content)
      if (typeof parsed === 'string') return parsed
      if (parsed && typeof parsed === 'object') {
        const candidate = parsed as Record<string, unknown>
        if (typeof candidate.apiKey === 'string') return candidate.apiKey
        if (typeof candidate.credentials === 'string') return candidate.credentials
      }
      return null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      if (error instanceof SyntaxError) {
        try {
          const raw = await readFile(this.filePath, 'utf8')
          const trimmed = raw.trim()
          if (trimmed) return trimmed
        } catch {}
        return null
      }
      return null
    }
  }

  private async tryMigrateLegacyApiKey(): Promise<string | null> {
    if (this.filePath === this.legacyFilePath) return null
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return null
      const encrypted = await readFile(this.legacyFilePath)
      const decrypted = await safeStorage.decryptStringAsync(encrypted)
      const apiKey = decrypted.result
      if (!apiKey) return null
      await this.saveApiKey(apiKey)
      try {
        await unlink(this.legacyFilePath)
      } catch {}
      return apiKey
    } catch {
      return null
    }
  }

  /** Saves an API key as plain JSON. */
  public async saveApiKey(apiKey: string): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(apiKey), { mode: 0o600 })
  }

  /** Removes the API key (both json and legacy bin). */
  public async deleteApiKey(): Promise<void> {
    for (const target of [this.filePath, this.legacyFilePath]) {
      try {
        await unlink(target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }

  /** Reads persisted ChatGPT OAuth tokens from JSON, migrating legacy bin if needed. */
  public async getChatGptAuth(): Promise<ChatGptAuthTokens | null> {
    const fromJson = await this.readChatGptJson()
    if (fromJson) return fromJson
    const migrated = await this.tryMigrateLegacyChatGptAuth()
    return migrated
  }

  private async readChatGptJson(): Promise<ChatGptAuthTokens | null> {
    try {
      const content = await readFile(this.chatGptPath(), 'utf8')
      const parsed: unknown = JSON.parse(content)
      if (!parsed || typeof parsed !== 'object') return null
      const candidate = parsed as Record<string, unknown>
      if (
        typeof candidate.accessToken !== 'string' ||
        typeof candidate.refreshToken !== 'string' ||
        typeof candidate.accountId !== 'string' ||
        typeof candidate.accountEmail !== 'string' ||
        typeof candidate.expiresAt !== 'number'
      ) {
        return null
      }
      return candidate as unknown as ChatGptAuthTokens
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      if (error instanceof SyntaxError) return null
      return null
    }
  }

  private async tryMigrateLegacyChatGptAuth(): Promise<ChatGptAuthTokens | null> {
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return null
      const encrypted = await readFile(this.chatGptLegacyPath)
      const decrypted = await safeStorage.decryptStringAsync(encrypted)
      const parsed: unknown = JSON.parse(decrypted.result)
      if (!parsed || typeof parsed !== 'object') return null
      const candidate = parsed as Record<string, unknown>
      if (
        typeof candidate.accessToken !== 'string' ||
        typeof candidate.refreshToken !== 'string' ||
        typeof candidate.accountId !== 'string' ||
        typeof candidate.accountEmail !== 'string' ||
        typeof candidate.expiresAt !== 'number'
      ) {
        return null
      }
      const tokens = candidate as unknown as ChatGptAuthTokens
      await this.saveChatGptAuth(tokens)
      try {
        await unlink(this.chatGptLegacyPath)
      } catch {}
      return tokens
    } catch {
      return null
    }
  }

  /** Saves ChatGPT OAuth tokens as plain JSON. */
  public async saveChatGptAuth(tokens: ChatGptAuthTokens): Promise<void> {
    await writeFile(this.chatGptPath(), JSON.stringify(tokens, null, 2), { mode: 0o600 })
  }

  /** Removes persisted ChatGPT OAuth tokens (both json and legacy bin). */
  public async deleteChatGptAuth(): Promise<void> {
    for (const target of [this.chatGptPath(), this.chatGptLegacyPath]) {
      try {
        await unlink(target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }
}
