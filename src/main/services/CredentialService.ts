/**
 * Persists API keys and ChatGPT OAuth tokens with Electron's operating-system-backed encryption.
 */

import { readFile, unlink, writeFile } from 'node:fs/promises'
import { safeStorage } from 'electron'

export interface ChatGptAuthTokens {
  accessToken: string
  refreshToken: string
  accountId: string
  accountEmail: string
  expiresAt: number
}

export default class CredentialService {
  /** Creates a credential service for one encrypted file. */
  public constructor(private readonly filePath: string) {}

  /** Reports whether an encrypted API key is stored. */
  public async hasApiKey(): Promise<boolean> {
    return Boolean(await this.getApiKey())
  }

  /** Decrypts the custom provider API key. */
  public async getApiKey(): Promise<string | null> {
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return null
      const encrypted = await readFile(this.filePath)
      const decrypted = await safeStorage.decryptStringAsync(encrypted)
      if (decrypted.shouldReEncrypt) await this.saveApiKey(decrypted.result)
      return decrypted.result
    } catch {
      return null
    }
  }

  /** Encrypts and saves an API key. */
  public async saveApiKey(apiKey: string): Promise<void> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error('Secure credential storage is not available on this system.')
    }
    const encrypted = await safeStorage.encryptStringAsync(apiKey)
    await writeFile(this.filePath, encrypted, { mode: 0o600 })
  }

  /** Removes the encrypted API key. */
  public async deleteApiKey(): Promise<void> {
    try {
      await unlink(this.filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  /** Reads persisted ChatGPT OAuth tokens from their dedicated file. */
  public async getChatGptAuth(): Promise<ChatGptAuthTokens | null> {
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return null
      const encrypted = await readFile(this.chatGptPath())
      const decrypted = await safeStorage.decryptStringAsync(encrypted)
      const parsed = JSON.parse(decrypted.result) as ChatGptAuthTokens
      if (
        typeof parsed.accessToken !== 'string' ||
        typeof parsed.refreshToken !== 'string' ||
        typeof parsed.accountId !== 'string' ||
        typeof parsed.accountEmail !== 'string' ||
        typeof parsed.expiresAt !== 'number'
      ) {
        return null
      }
      if (decrypted.shouldReEncrypt) await this.saveChatGptAuth(parsed)
      return parsed
    } catch {
      return null
    }
  }

  /** Encrypts and saves ChatGPT OAuth tokens. */
  public async saveChatGptAuth(tokens: ChatGptAuthTokens): Promise<void> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error('Secure credential storage is not available on this system.')
    }
    const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(tokens))
    await writeFile(this.chatGptPath(), encrypted, { mode: 0o600 })
  }

  /** Removes persisted ChatGPT OAuth tokens. */
  public async deleteChatGptAuth(): Promise<void> {
    try {
      await unlink(this.chatGptPath())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  /** Resolves the ChatGPT auth token file path. */
  private chatGptPath(): string {
    const dir = this.filePath.replace(/[^/\\]+$/, '')
    return `${dir}chatgpt_auth.bin`
  }
}
