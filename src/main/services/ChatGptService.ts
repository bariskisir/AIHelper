/**
 * Owns ChatGPT OAuth, model discovery, token refresh, and streaming AI scan responses.
 */

import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { shell } from 'electron'
import type { ChatGptState, ServiceTier, ThinkingLevel, VerbosityLevel } from '@shared/types'
import { formatChatGptUsage, normalizeChatGptModels } from './ChatGptMetadata'
import type CredentialService from './CredentialService'
import type { ChatGptAuthTokens } from './CredentialService'
import type LoggerService from './LoggerService'

const CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const CHATGPT_ORIGINATOR = 'codex_cli_rs'
const CHATGPT_SCOPE = 'openid profile email offline_access'
const CHATGPT_AUTH_URL = 'https://auth.openai.com/oauth/authorize'
const CHATGPT_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CHATGPT_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
const CHATGPT_MODELS_URL = 'https://chatgpt.com/backend-api/codex/models'
const CHATGPT_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const CODEX_LATEST_URL = 'https://registry.npmjs.org/@openai/codex/latest'
const DEFAULT_CODEX_CLIENT_VERSION = '0.145.0'
const OAUTH_REDIRECT_URL = 'http://localhost:1455/auth/callback'
const OAUTH_TIMEOUT_MS = 3 * 60 * 1_000

interface ChatGptServiceEvents {
  onState: (state: ChatGptState) => void
}

export default class ChatGptService {
  private state: ChatGptState = {
    status: 'signed-out',
    accountEmail: '',
    limitLabel: '',
    models: [],
  }
  private loginInProgress = false
  private codexClientVersion = DEFAULT_CODEX_CLIENT_VERSION
  private codexVersionFetched = false

  /** Initializes the service with credential and event dependencies. */
  public constructor(
    private readonly credentials: CredentialService,
    private readonly events: ChatGptServiceEvents,
    private readonly logger: LoggerService,
  ) {}

  /** Restores non-secret authentication state from encrypted credentials. */
  public async initialize(): Promise<void> {
    const auth = await this.credentials.getChatGptAuth()
    if (!auth) return
    this.state = {
      ...this.state,
      status: 'signed-in',
      accountEmail: auth.accountEmail,
    }
    void this.refresh().catch((error: unknown) => {
      this.logger.warn('ChatGPT', 'ChatGPT metadata refresh failed during startup.', error)
    })
  }

  /** Returns a copy of renderer-safe authentication and model state. */
  public getState(): ChatGptState {
    return structuredClone(this.state)
  }

  /** Starts PKCE OAuth and completes it asynchronously through a localhost callback. */
  public async signIn(): Promise<void> {
    if (this.loginInProgress) return
    this.loginInProgress = true
    this.updateState({ status: 'signing-in', error: undefined })
    const verifier = randomBytes(32).toString('base64url')
    const state = randomBytes(16).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const callback = this.waitForOAuthCallback(state)
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CHATGPT_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URL,
      scope: CHATGPT_SCOPE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    })
    await shell.openExternal(`${CHATGPT_AUTH_URL}?${params.toString()}`)
    try {
      const code = await callback
      const tokens = await this.exchangeCode(code, verifier)
      if (!tokens) {
        this.updateState({ status: 'error', error: 'Token exchange failed.' })
        return
      }
      await this.credentials.saveChatGptAuth(tokens)
      this.state = {
        ...this.state,
        status: 'signed-in',
        accountEmail: tokens.accountEmail,
      }
      await this.refresh()
    } catch (error) {
      this.updateState({ status: 'error', error: 'Login failed.' })
      this.logger.error('ChatGPT', 'ChatGPT sign in failed.', error)
    } finally {
      this.loginInProgress = false
    }
  }

  /** Removes local ChatGPT credentials. */
  public async signOut(): Promise<ChatGptState> {
    await this.credentials.deleteChatGptAuth()
    this.state = {
      status: 'signed-out',
      accountEmail: '',
      limitLabel: '',
      models: [],
    }
    this.events.onState(this.getState())
    return this.getState()
  }

  /** Refreshes models and usage metadata. */
  public async refresh(): Promise<ChatGptState> {
    const auth = await this.credentials.getChatGptAuth()
    if (!auth) {
      this.updateState({ status: 'signed-out' })
      return this.getState()
    }
    await Promise.all([this.fetchModels(auth), this.fetchUsage(auth)])
    this.events.onState(this.getState())
    return this.getState()
  }

  /** Resolves current access token, refreshing when expired. */
  public async resolveAccessToken(): Promise<string | null> {
    let auth = await this.credentials.getChatGptAuth()
    if (!auth) return null
    if (Date.now() > auth.expiresAt - 60_000) {
      auth = await this.refreshAccessToken(auth)
      if (!auth) return null
    }
    return auth.accessToken
  }

  /** Streams a scan response for text or image input. */
  public async streamScan(
    systemPrompt: string,
    userInput: string,
    imageBase64: string | undefined,
    model: string,
    thinkingLevel: ThinkingLevel,
    _verbosity: VerbosityLevel,
    _serviceTier: ServiceTier,
    onDelta: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<string> {
    const auth = await this.credentials.getChatGptAuth()
    if (!auth) throw new Error('Not signed in to ChatGPT.')
    let accessToken = auth.accessToken
    if (Date.now() > auth.expiresAt - 60_000) {
      const refreshed = await this.refreshAccessToken(auth)
      if (!refreshed) throw new Error('Token refresh failed.')
      accessToken = refreshed.accessToken
    }
    const content: Record<string, unknown>[] = [{ type: 'input_text', text: userInput }]
    if (imageBase64) {
      content.push({
        type: 'input_image',
        image_url: `data:image/png;base64,${imageBase64}`,
      })
    }

    const effectiveModel = model.trim() || (this.state.models[0]?.id ?? '')
    const modelObj = this.state.models.find((m) => m.id === effectiveModel)
    const supportsThinking = modelObj ? modelObj.supportsThinking : false

    const body: Record<string, unknown> = {
      model: effectiveModel,
      input: [{ type: 'message', role: 'user', content }],
      stream: true,
      store: false,
      include: ['reasoning.encrypted_content'],
      instructions: systemPrompt || '.',
      ...(thinkingLevel !== 'off' && supportsThinking
        ? { reasoning: { effort: thinkingLevel, summary: 'auto' } }
        : {}),
    }

    const response = await fetch(CHATGPT_RESPONSES_URL, {
      method: 'POST',
      headers: this.createHeaders(accessToken, auth.accountId),
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) {
      let errText = ''
      try {
        errText = await response.text()
      } catch {
        /* ignore */
      }
      this.logger.error('ChatGPT', `ChatGPT API error ${response.status}: ${errText}`)
      throw new Error(`ChatGPT API error: ${response.status}${errText ? ` - ${errText}` : ''}`)
    }
    return this.readStream(response, onDelta, signal)
  }

  /** Fetches the model catalog from ChatGPT. */
  private async fetchModels(auth: ChatGptAuthTokens): Promise<void> {
    try {
      const version = await this.fetchCodexClientVersion()
      const url = `${CHATGPT_MODELS_URL}?client_version=${encodeURIComponent(version)}`
      const response = await fetch(url, {
        headers: this.createHeaders(auth.accessToken, auth.accountId, false),
      })
      if (!response.ok) return
      const payload = await response.json()
      this.state.models = normalizeChatGptModels(payload)
    } catch (error) {
      this.logger.warn('ChatGPT', 'Model catalog fetch failed.', error)
    }
  }

  /** Fetches usage data from ChatGPT. */
  private async fetchUsage(auth: ChatGptAuthTokens): Promise<void> {
    try {
      const response = await fetch(CHATGPT_USAGE_URL, {
        headers: this.createHeaders(auth.accessToken, auth.accountId, false),
      })
      if (!response.ok) return
      const payload = await response.json()
      this.state.limitLabel = formatChatGptUsage(payload)
    } catch (error) {
      this.logger.warn('ChatGPT', 'Usage fetch failed.', error)
    }
  }

  /** Exchanges an OAuth authorization code for tokens. */
  private async exchangeCode(code: string, verifier: string): Promise<ChatGptAuthTokens | null> {
    const response = await fetch(CHATGPT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CHATGPT_CLIENT_ID,
        code,
        redirect_uri: OAUTH_REDIRECT_URL,
        code_verifier: verifier,
      }),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as Record<string, unknown>
    return {
      accessToken: String(payload.access_token ?? ''),
      refreshToken: String(payload.refresh_token ?? ''),
      accountId: this.readJwtClaim(String(payload.access_token ?? ''), [
        'https://api.openai.com/auth',
        'account_id',
      ]),
      accountEmail: this.readJwtClaim(String(payload.id_token ?? ''), ['email']),
      expiresAt: Date.now() + (Number(payload.expires_in) || 600) * 1_000,
    }
  }

  /** Refreshes the OAuth access token. */
  private async refreshAccessToken(auth: ChatGptAuthTokens): Promise<ChatGptAuthTokens | null> {
    try {
      const response = await fetch(CHATGPT_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: CHATGPT_CLIENT_ID,
          refresh_token: auth.refreshToken,
        }),
      })
      if (!response.ok) return null
      const payload = (await response.json()) as Record<string, unknown>
      const tokens: ChatGptAuthTokens = {
        ...auth,
        accessToken: String(payload.access_token ?? ''),
        refreshToken: String(payload.refresh_token ?? auth.refreshToken),
        expiresAt: Date.now() + (Number(payload.expires_in) || 600) * 1_000,
      }
      await this.credentials.saveChatGptAuth(tokens)
      return tokens
    } catch {
      return null
    }
  }

  /** Starts a temporary HTTP server and returns the OAuth authorization code. */
  private waitForOAuthCallback(expectedState: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((request, response) => {
        try {
          const url = new URL(request.url ?? '', OAUTH_REDIRECT_URL)
          const code = url.searchParams.get('code')
          const state = url.searchParams.get('state')
          if (state !== expectedState) {
            response.writeHead(400)
            response.end('Invalid state.')
            return
          }
          if (!code) {
            response.writeHead(400)
            response.end('No authorization code.')
            return
          }
          response.writeHead(200, { 'Content-Type': 'text/html' })
          response.end(
            '<html><body><h1>Logged in!</h1><p>You can close this window.</p></body></html>',
          )
          server.close()
          resolve(code)
        } catch (error) {
          response.writeHead(500)
          response.end('Internal error.')
          reject(error)
        }
      })
      const timeout = setTimeout(() => {
        server.close()
        reject(new Error('OAuth login timed out.'))
      }, OAUTH_TIMEOUT_MS)
      server.listen(1455, () => {
        // Server started; waiting for callback
      })
      server.on('close', () => clearTimeout(timeout))
    })
  }

  /** Reads one nested string claim without trusting JWT contents for authorization. */
  private readJwtClaim(token: string, path: string[]): string {
    try {
      let value: unknown = JSON.parse(
        Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
      )
      for (const key of path) {
        if (!value || typeof value !== 'object') return ''
        value = (value as Record<string, unknown>)[key]
      }
      return typeof value === 'string' ? value : ''
    } catch {
      return ''
    }
  }

  /** Creates authenticated ChatGPT request headers. */
  private createHeaders(
    accessToken: string,
    accountId: string,
    json = true,
  ): Record<string, string> {
    return {
      Accept: json ? 'text/event-stream' : 'application/json',
      Authorization: `Bearer ${accessToken}`,
      originator: CHATGPT_ORIGINATOR,
      ...(accountId ? { 'chatgpt-account-id': accountId } : {}),
      ...(json
        ? { 'Content-Type': 'application/json', 'OpenAI-Beta': 'responses=experimental' }
        : {}),
    }
  }

  /** Resolves the model-catalog client version from NPM once per session. */
  private async fetchCodexClientVersion(): Promise<string> {
    if (this.codexVersionFetched) return this.codexClientVersion
    this.codexVersionFetched = true
    try {
      const response = await fetch(CODEX_LATEST_URL, {
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) return this.codexClientVersion
      const payload = (await response.json()) as unknown
      if (!payload || typeof payload !== 'object') return this.codexClientVersion
      const version = (payload as Record<string, unknown>).version
      if (typeof version === 'string' && version.trim()) {
        this.codexClientVersion = version.trim()
      }
      return this.codexClientVersion
    } catch {
      return this.codexClientVersion
    }
  }

  /** Reads one SSE stream and invokes the delta callback. */
  private async readStream(
    response: Response,
    onDelta: (delta: string) => void,
    signal: AbortSignal,
  ): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body.')
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''
    try {
      while (true) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const parsed = this.parseSseLine(line)
          if (parsed) {
            if (parsed.delta) {
              fullText += parsed.delta
              onDelta(parsed.delta)
            }
            if (parsed.completedText) {
              fullText = parsed.completedText
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
    return fullText
  }

  /** Parses one ChatGPT Responses SSE data line. */
  private parseSseLine(line: string): { delta: string; completedText: string } | null {
    if (!line.startsWith('data:')) return null
    const raw = line.slice(5).trim()
    if (!raw || raw === '[DONE]') return null
    try {
      const event = JSON.parse(raw) as Record<string, unknown>
      const type = typeof event.type === 'string' ? event.type : ''
      const delta =
        (type.includes('output_text.delta') && typeof event.delta === 'string' && event.delta) || ''
      const response = event.response as Record<string, unknown> | undefined
      return {
        delta,
        completedText: type === 'response.completed' ? this.extractResponseText(response) : '',
      }
    } catch {
      return null
    }
  }

  /** Extracts text from a completed Responses payload fallback. */
  private extractResponseText(response: Record<string, unknown> | undefined): string {
    if (!response || !Array.isArray(response.output)) return ''
    const text: string[] = []
    for (const item of response.output) {
      if (!item || typeof item !== 'object') continue
      const content = (item as Record<string, unknown>).content
      if (!Array.isArray(content)) continue
      for (const part of content) {
        if (!part || typeof part !== 'object') continue
        const value = (part as Record<string, unknown>).text
        if (typeof value === 'string') text.push(value)
      }
    }
    return text.join('\n').trim()
  }

  /** Merges one partial public state and emits it to the renderer. */
  private updateState(patch: Partial<ChatGptState>): void {
    this.state = { ...this.state, ...patch }
    this.events.onState(this.getState())
  }
}
