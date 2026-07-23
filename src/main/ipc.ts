/**
 * Defines the validated IPC boundary between the renderer and main-process services.
 */

import { writeFile } from 'node:fs/promises'
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen as electronScreen,
  shell,
  type WebContents,
} from 'electron'
import { IpcChannel } from '@shared/IpcChannel'
import { APP_AUTHOR_URL } from '@shared/appInfo'
import {
  EXPORT_FORMATS,
  LOG_LEVELS,
  type BootstrapPayload,
  type UpdateStateEvent,
} from '@shared/types'
import { z } from 'zod'
import { createWorker } from 'tesseract.js'
import { settingsPatchSchema, settingsSchema } from './settingsSchema'
import type { AppSettingsPatch } from '@shared/types'
import type AiProviderService from './services/AiProviderService'
import type AppUpdater from './services/AppUpdater'
import type ChatGptService from './services/ChatGptService'
import type CredentialService from './services/CredentialService'
import { renderSessions } from './services/ExportService'
import type LoggerService from './services/LoggerService'
import type StorageService from './services/StorageService'

const scanTextSchema = z.object({
  text: z.string().trim().max(200_000).optional().default(''),
  imageDataUrl: z.string().max(50_000_000).optional(),
  settings: settingsSchema,
})
const scanImageSchema = z.object({
  imageDataUrl: z.string().min(1).max(50_000_000),
  text: z.string().trim().max(200_000).optional(),
  settings: settingsSchema,
})
const apiKeySchema = z.string().trim().min(1).max(512)
const sessionIdSchema = z.uuid()
const exportFormatSchema = z.enum(EXPORT_FORMATS)
const rendererLogSchema = z.object({
  level: z.enum(LOG_LEVELS),
  module: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1_000),
  details: z.string().max(8_000).optional(),
})

const TRUSTED_EXTERNAL_ORIGINS = new Set([
  'https://github.com',
  APP_AUTHOR_URL,
  'https://chatgpt.com',
  'https://auth.openai.com',
])

interface IpcServices {
  storage: StorageService
  credentials: CredentialService
  chatGpt: ChatGptService
  aiProvider: AiProviderService
  updater: AppUpdater
  logger: LoggerService
}

/** Removes all previously registered IPC handlers to prevent duplicates on hot-reload. */
export const removeIpcHandlers = (): void => {
  Object.values(IpcChannel).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })
  ipcMain.removeAllListeners(IpcChannel.LogWrite)
}

/** Registers every IPC handler and wires up all main-process services to the renderer. */
export const registerIpc = (window: BrowserWindow, services: IpcServices): void => {
  removeIpcHandlers()

  /** Throws if the IPC event originates from an untrusted sender. */
  const assertSender = (sender: WebContents): void => {
    if (sender.id !== window.webContents.id) throw new Error('Untrusted IPC sender.')
  }

  /** Sends a typed payload over the main window's webContents channel. */
  const send = <T>(channel: string, payload: T): void => {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }

  services.updater.initialize((event: UpdateStateEvent) => send(IpcChannel.UpdateState, event))

  ipcMain.handle(IpcChannel.AppBootstrap, async (event) => {
    assertSender(event.sender)
    const [settings, chatGptState] = await Promise.all([
      services.storage.loadSettings(),
      Promise.resolve(services.chatGpt.getState()),
    ])
    let sessions = await services.storage.listSessions()
    if (sessions.length === 0) {
      await services.storage.createSession()
      sessions = await services.storage.listSessions()
    }
    const firstSession = sessions[0]
    const currentSession = firstSession
      ? await services.storage.getSession(firstSession.id)
      : await services.storage.createSession()
    return {
      settings,
      sessions,
      currentSession,
      chatGpt: chatGptState,
      platform: process.platform as BootstrapPayload['platform'],
      version: app.getVersion(),
    } satisfies BootstrapPayload
  })

  ipcMain.handle(IpcChannel.SettingsSave, async (event, input: unknown) => {
    assertSender(event.sender)
    const patch = settingsPatchSchema.parse(input) as AppSettingsPatch
    const saved = await services.storage.updateSettings(patch)
    window.setAlwaysOnTop(saved.alwaysOnTop)
    services.logger.setLevel(saved.logLevel)
    return saved
  })

  ipcMain.handle(IpcChannel.CredentialsSave, async (event, input: unknown) => {
    assertSender(event.sender)
    await services.credentials.saveApiKey(apiKeySchema.parse(input))
  })
  ipcMain.handle(IpcChannel.CredentialsGet, async (event) => {
    assertSender(event.sender)
    return services.credentials.getApiKey()
  })
  ipcMain.handle(IpcChannel.CredentialsDelete, async (event) => {
    assertSender(event.sender)
    await services.credentials.deleteApiKey()
  })

  ipcMain.handle('chatgpt:sign-in', async (event) => {
    assertSender(event.sender)
    await services.chatGpt.signIn()
  })
  ipcMain.handle('chatgpt:sign-out', async (event) => {
    assertSender(event.sender)
    return services.chatGpt.signOut()
  })
  ipcMain.handle('chatgpt:refresh', async (event) => {
    assertSender(event.sender)
    return services.chatGpt.refresh()
  })

  // Screen capture
  ipcMain.handle('screen:capture', async (event, box: unknown) => {
    assertSender(event.sender)
    const b = box as { left: number; top: number; width: number; height: number } | null
    if (!b || typeof b.left !== 'number' || typeof b.width !== 'number')
      throw new Error('Invalid capture box.')
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })
    if (!sources[0]?.thumbnail) throw new Error('No screen source.')
    const img = sources[0].thumbnail

    const primaryDisplay = electronScreen.getPrimaryDisplay()
    const sx = img.getSize().width / primaryDisplay.bounds.width
    const sy = img.getSize().height / primaryDisplay.bounds.height
    const cropped = img.crop({
      x: Math.round(b.left * sx),
      y: Math.round(b.top * sy),
      width: Math.round(b.width * sx),
      height: Math.round(b.height * sy),
    })
    return cropped.toDataURL()
  })

  // --- Fullscreen Screen Selection ---
  interface SelectionPayload {
    displayIndex: number
    left: number
    top: number
    width: number
    height: number
  }

  let lastSelectionPayload: SelectionPayload | null = null

  /** Captures the screen region described by the selection payload and returns it as a PNG data URL. */
  const captureSelectionRegion = async (payload: SelectionPayload): Promise<string | null> => {
    try {
      const displays = electronScreen.getAllDisplays()
      const primary = electronScreen.getPrimaryDisplay()
      const targetDisplay = displays[payload.displayIndex] ?? primary
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.max(1920, targetDisplay.bounds.width * 2),
          height: Math.max(1080, targetDisplay.bounds.height * 2),
        },
      })
      let source = sources.find((s) => s.display_id === String(targetDisplay.id))
      if (!source) source = sources[payload.displayIndex] ?? sources[0]
      if (!source?.thumbnail) return null
      const img = source.thumbnail
      const sx = img.getSize().width / targetDisplay.bounds.width
      const sy = img.getSize().height / targetDisplay.bounds.height
      const cropped = img.crop({
        x: Math.round(payload.left * sx),
        y: Math.round(payload.top * sy),
        width: Math.round(payload.width * sx),
        height: Math.round(payload.height * sy),
      })
      return cropped.toDataURL()
    } catch {
      return null
    }
  }

  ipcMain.handle('screen:select', async (event, mode: unknown, repeat: unknown) => {
    assertSender(event.sender)
    if (mode !== 'text' && mode !== 'image') throw new Error('Invalid scan mode.')

    // Repeat mode: immediately capture last selection, no overlay
    if (repeat === true && lastSelectionPayload) {
      const dataUrl = await captureSelectionRegion(lastSelectionPayload)
      if (dataUrl) return dataUrl
      // if capture failed, fall through to normal overlay
    }

    const displays = electronScreen.getAllDisplays()
    const borderColor = mode === 'image' ? '#d6a84f' : '#16a085'
    const fillColor = mode === 'image' ? 'rgba(214,168,79,0.15)' : 'rgba(22,160,133,0.12)'

    // Hide main window so it doesn't block the screen
    window.hide()
    await new Promise((r) => setTimeout(r, 150))

    const overlayWins: BrowserWindow[] = []

    return new Promise<string | null>((resolve) => {
      let resolved = false

      /** Closes all overlay windows and restores the main application window. */
      const cleanup = () => {
        if (resolved) return
        resolved = true
        ipcMain.removeListener('screen-selection', handler)
        for (const w of overlayWins) {
          if (!w.isDestroyed()) w.close()
        }
        if (!window.isDestroyed()) {
          window.show()
          window.focus()
        }
      }

      /** Handles the renderer's screen-selection result and captures the chosen region. */
      const handler = (_ipcEvent: Electron.IpcMainEvent, selResult: unknown) => {
        const payload = selResult as SelectionPayload | null

        if (!payload || typeof payload.left !== 'number') {
          cleanup()
          resolve(null)
          return
        }

        lastSelectionPayload = payload
        // Mark resolved before closing windows so the 'closed' handler
        // doesn't also call resolve(null)
        resolved = true
        ipcMain.removeListener('screen-selection', handler)

        // Close overlays so they don't appear in the capture
        for (const w of overlayWins) {
          if (!w.isDestroyed()) w.close()
        }
        overlayWins.length = 0

        // Wait for overlays to visually disappear before capturing
        setTimeout(() => {
          void (async () => {
            const dataUrl = await captureSelectionRegion(payload)
            if (!window.isDestroyed()) {
              window.show()
              window.focus()
            }
            resolve(dataUrl)
          })()
        }, 100)
      }

      ipcMain.on('screen-selection', handler)

      const prevSel = lastSelectionPayload ? JSON.stringify(lastSelectionPayload) : 'null'

      for (let i = 0; i < displays.length; i++) {
        const d = displays[i] ?? electronScreen.getPrimaryDisplay()
        const overlayWin = new BrowserWindow({
          x: d.bounds.x,
          y: d.bounds.y,
          width: d.bounds.width,
          height: d.bounds.height,
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          resizable: false,
          movable: false,
          focusable: true,
          acceptFirstMouse: true,
          webPreferences: { sandbox: false, nodeIntegration: true, contextIsolation: false },
        })

        overlayWins.push(overlayWin)

        // Prefer main-process keyboard handling — transparent fullscreen
        // BrowserWindows often never deliver DOM key events to the document.
        // Esc always cancels. Enter re-confirms the previous selection when one exists.
        overlayWin.webContents.on('before-input-event', (_event, input) => {
          if (resolved) return
          if (input.type !== 'keyDown') return
          const isEscape = input.key === 'Escape'
          const isEnter =
            input.key === 'Enter' ||
            input.key === 'Return' ||
            input.code === 'Enter' ||
            input.code === 'NumpadEnter'

          if (isEscape) {
            ipcMain.emit('screen-selection', {} as Electron.IpcMainEvent, null)
            return
          }
          if (isEnter && lastSelectionPayload) {
            ipcMain.emit('screen-selection', {} as Electron.IpcMainEvent, lastSelectionPayload)
          }
        })

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{width:100vw;height:100vh;user-select:none;overflow:hidden;cursor:crosshair;background:transparent}
        #sel{position:fixed;border:2px dashed ${borderColor};background:${fillColor};display:none;pointer-events:none;border-radius:4px}
        #lbl{position:fixed;top:18px;left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:8px;background:rgba(15,23,42,0.9);color:#fff;font:14px/1.3 system-ui;pointer-events:none;white-space:nowrap}
        #dim{position:fixed;inset:0;background:rgba(15,23,42,0.18);pointer-events:none}
      </style></head><body>
        <div id="dim"></div><div id="lbl">Drag to select — Esc cancels</div><div id="sel"></div>
        <script>
          const { ipcRenderer } = require('electron')
          const sel = document.getElementById('sel')
          const lbl = document.getElementById('lbl')
          var prevSel = ${prevSel}
          var displayIndex = ${i}
          var sx=0, sy=0, selecting=false

          // Show previous selection if one exists for this display
          if (prevSel && prevSel.displayIndex === displayIndex) {
            sel.style.left = prevSel.left + 'px'
            sel.style.top = prevSel.top + 'px'
            sel.style.width = prevSel.width + 'px'
            sel.style.height = prevSel.height + 'px'
            sel.style.display = 'block'
            lbl.textContent = 'Enter to confirm — drag to re-select — Esc cancels'
          }

          // DOM keyboard too — redundant with before-input-event above
          document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
              e.preventDefault()
              ipcRenderer.send('screen-selection', null)
              return
            }
            var isEnter = e.key === 'Enter' || e.key === 'Return' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13
            if (isEnter && prevSel) {
              e.preventDefault()
              ipcRenderer.send('screen-selection', prevSel)
            }
          })

          document.addEventListener('mousedown', function(e) {
            sx=e.clientX; sy=e.clientY; selecting=true
            sel.style.borderStyle = 'solid'
            sel.style.display='block'
            lbl.textContent = 'Drag to select — Esc cancels'
          })
          document.addEventListener('mousemove', function(e) {
            if (!selecting) return
            var l=Math.min(sx,e.clientX), t=Math.min(sy,e.clientY)
            sel.style.left=l+'px'; sel.style.top=t+'px'
            sel.style.width=Math.abs(e.clientX-sx)+'px'; sel.style.height=Math.abs(e.clientY-sy)+'px'
          })
          document.addEventListener('mouseup', function(e) {
            if (!selecting) return; selecting=false
            var l=Math.min(sx,e.clientX), t=Math.min(sy,e.clientY)
            var w=Math.abs(e.clientX-sx), h=Math.abs(e.clientY-sy)
            if (w<10 || h<10) return
            ipcRenderer.send('screen-selection', { displayIndex: displayIndex, left:l, top:t, width:w, height:h })
          })
          document.body.setAttribute('tabindex', '0')
          document.body.focus()
        </script>
      </body></html>`

        void overlayWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        overlayWin.once('ready-to-show', () => {
          overlayWin.show()
          overlayWin.focus()
          overlayWin.webContents.focus()
        })
        // Also try focusing after the page finishes loading
        overlayWin.webContents.once('did-finish-load', () => {
          if (!overlayWin.isDestroyed()) {
            overlayWin.focus()
            overlayWin.webContents.focus()
          }
        })
        overlayWin.on('closed', () => {
          if (!resolved) {
            cleanup()
            resolve(null)
          }
        })
      }
    })
  })

  let sharedOcrWorkerPromise: ReturnType<typeof createWorker> | null = null

  /** Returns a lazily created Tesseract OCR worker instance shared across all scans. */
  const getOcrWorker = async () => {
    if (!sharedOcrWorkerPromise) {
      sharedOcrWorkerPromise = createWorker('eng')
    }
    return sharedOcrWorkerPromise
  }

  // Scan text
  ipcMain.handle(IpcChannel.AiScanText, async (event, input: unknown) => {
    assertSender(event.sender)
    const { text, imageDataUrl, settings: scanSettings } = scanTextSchema.parse(input)
    const now = new Date().toISOString()
    const session = await services.storage.createSession()
    const sessionId = session.id

    let finalText = text?.trim() || ''
    if (imageDataUrl) {
      try {
        const worker = await getOcrWorker()
        const ret = await worker.recognize(imageDataUrl)
        const ocrText = ret.data.text.trim()
        if (ocrText) finalText = ocrText
      } catch (err) {
        services.logger.error('IPC', 'OCR recognition failed.', { error: String(err) })
      }
    }

    const item = {
      id: crypto.randomUUID(),
      scanMode: 'text' as const,
      provider: 'chatgpt',
      model: services.aiProvider.resolveModel(scanSettings, 'text'),
      thinkingLevel: services.aiProvider.resolveThinkingLevel(scanSettings, 'text'),
      verbosity: scanSettings.chatGptVerbosity,
      systemPromptPreset: scanSettings.textSystemPromptPreset,
      systemPromptText: services.aiProvider.resolveSystemPrompt(scanSettings, 'text'),
      input: finalText,
      output: '',
      imageDataUrl: imageDataUrl || undefined,
      createdAt: now,
    }
    services.logger.info('IPC:AiScanText', 'Executing text scan request', {
      provider: 'chatgpt',
      resolvedModel: item.model,
      thinkingLevel: item.thinkingLevel,
      textLength: finalText.length,
      hasImageDataUrl: !!imageDataUrl,
    })
    send(IpcChannel.AiResult, {
      sessionId,
      itemId: item.id,
      delta: '',
      isComplete: false,
      inputText: finalText,
    })
    const ac = new AbortController()
    let activeAc: AbortController | null = ac
    ipcMain.handle(IpcChannel.AiCancel, async (cancelEvent) => {
      assertSender(cancelEvent.sender)
      activeAc?.abort()
      activeAc = null
    })
    try {
      const output = await services.aiProvider.streamScan(
        scanSettings,
        'text',
        finalText || '.',
        undefined,
        {
          onDelta: (d) =>
            send(IpcChannel.AiResult, { sessionId, itemId: item.id, delta: d, isComplete: false }),
          signal: ac.signal,
        },
      )
      item.output = output
      const updated = await services.storage.setSessionItem(sessionId, item)
      send(IpcChannel.AiResult, { sessionId, itemId: item.id, delta: '', isComplete: true })
      send(IpcChannel.SessionUpdated, {
        sessions: await services.storage.listSessions(),
        currentSession: updated,
      })
      ipcMain.removeHandler(IpcChannel.AiCancel)
      return item
    } catch (error) {
      ipcMain.removeHandler(IpcChannel.AiCancel)
      if (
        (error as Error).name === 'AbortError' ||
        (error as DOMException)?.name === 'AbortError'
      ) {
        item.output = item.output || '(cancelled)'
        await services.storage.setSessionItem(sessionId, item)
        return item
      }
      throw error
    }
  })

  // Scan image
  ipcMain.handle(IpcChannel.AiScanImage, async (event, input: unknown) => {
    assertSender(event.sender)
    const { imageDataUrl, text, settings: scanSettings } = scanImageSchema.parse(input)
    const now = new Date().toISOString()
    const session = await services.storage.createSession()
    const sessionId = session.id
    const resolvedModel = services.aiProvider.resolveModel(scanSettings, 'image')
    const promptText = text?.trim() || 'Analyze this image.'

    const item = {
      id: crypto.randomUUID(),
      scanMode: 'image' as const,
      provider: 'chatgpt',
      model: resolvedModel,
      thinkingLevel: services.aiProvider.resolveThinkingLevel(scanSettings, 'image'),
      verbosity: scanSettings.chatGptVerbosity,
      systemPromptPreset: scanSettings.imageSystemPromptPreset,
      systemPromptText: services.aiProvider.resolveSystemPrompt(scanSettings, 'image'),
      input: text?.trim() || '',
      output: '',
      imageDataUrl,
      createdAt: now,
    }
    services.logger.info('IPC:AiScanImage', 'Executing image scan request', {
      provider: 'chatgpt',
      resolvedModel: item.model,
      thinkingLevel: item.thinkingLevel,
      promptText,
      hasImageDataUrl: !!imageDataUrl,
    })
    send(IpcChannel.AiResult, {
      sessionId,
      itemId: item.id,
      delta: '',
      isComplete: false,
      inputText: item.input,
    })
    const ac = new AbortController()
    let activeAc: AbortController | null = ac
    ipcMain.handle(IpcChannel.AiCancel, async (cancelEvent) => {
      assertSender(cancelEvent.sender)
      activeAc?.abort()
      activeAc = null
    })
    try {
      const output = await services.aiProvider.streamScan(
        scanSettings,
        'image',
        promptText,
        imageDataUrl,
        {
          onDelta: (d) =>
            send(IpcChannel.AiResult, { sessionId, itemId: item.id, delta: d, isComplete: false }),
          signal: ac.signal,
        },
      )
      item.output = output
      const updated = await services.storage.setSessionItem(sessionId, item)
      send(IpcChannel.AiResult, { sessionId, itemId: item.id, delta: '', isComplete: true })
      send(IpcChannel.SessionUpdated, {
        sessions: await services.storage.listSessions(),
        currentSession: updated,
      })
      ipcMain.removeHandler(IpcChannel.AiCancel)
      return item
    } catch (error) {
      ipcMain.removeHandler(IpcChannel.AiCancel)
      if (
        (error as Error).name === 'AbortError' ||
        (error as DOMException)?.name === 'AbortError'
      ) {
        item.output = item.output || '(cancelled)'
        await services.storage.setSessionItem(sessionId, item)
        return item
      }
      throw error
    }
  })

  ipcMain.handle(IpcChannel.SessionList, async (event) => {
    assertSender(event.sender)
    return services.storage.listSessions()
  })
  ipcMain.handle(IpcChannel.SessionCreate, async (event) => {
    assertSender(event.sender)
    const doc = await services.storage.createSession()
    const sessions = await services.storage.listSessions()
    send(IpcChannel.SessionUpdated, { sessions, currentSession: doc })
    return doc
  })
  ipcMain.handle(IpcChannel.SessionRename, async (event, idInput: unknown, titleInput: unknown) => {
    assertSender(event.sender)
    const id = sessionIdSchema.parse(idInput)
    const title = z.string().trim().min(1).max(200).parse(titleInput)
    const doc = await services.storage.renameSession(id, title)
    const sessions = await services.storage.listSessions()
    send(IpcChannel.SessionUpdated, { sessions, currentSession: doc })
    return doc
  })
  ipcMain.handle('session:get', async (event, id: unknown) => {
    assertSender(event.sender)
    return services.storage.getSession(sessionIdSchema.parse(id))
  })
  ipcMain.handle(IpcChannel.SessionDelete, async (event, id: unknown) => {
    assertSender(event.sender)
    return services.storage.deleteSession(sessionIdSchema.parse(id))
  })
  ipcMain.handle(IpcChannel.SessionDeleteAll, async (event) => {
    assertSender(event.sender)
    return services.storage.deleteAllSessions()
  })
  ipcMain.handle(
    IpcChannel.SessionExport,
    async (event, idInput: unknown, formatInput: unknown) => {
      assertSender(event.sender)
      const format = exportFormatSchema.parse(formatInput)
      const sessions = idInput
        ? [await services.storage.getSession(sessionIdSchema.parse(idInput))]
        : await Promise.all(
            (await services.storage.listSessions()).map((s) => services.storage.getSession(s.id)),
          )
      const firstTitle = sessions[0]?.title ?? 'session'
      const defaultName =
        sessions.length === 1 ? firstTitle.replace(/[<>:"/\\|?*]/g, '-') : 'all-sessions'
      const result = await dialog.showSaveDialog(window, {
        title: 'Export Sessions',
        defaultPath: `${defaultName}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      })
      if (result.canceled || !result.filePath) return false
      await writeFile(result.filePath, renderSessions(sessions, format), 'utf8')
      return true
    },
  )

  ipcMain.handle('models:fetch', async (event) => {
    assertSender(event.sender)
    return services.aiProvider.fetchModels()
  })

  ipcMain.handle(IpcChannel.WindowAlwaysOnTop, (event, enabled: unknown) => {
    assertSender(event.sender)
    if (typeof enabled !== 'boolean') throw new Error('Invalid window preference.')
    window.setAlwaysOnTop(enabled)
  })
  ipcMain.handle(IpcChannel.ThemeSet, (event, theme: unknown) => {
    assertSender(event.sender)
    if (theme !== 'light' && theme !== 'dark') throw new Error('Invalid theme.')
    window.setTitleBarOverlay({
      color: theme === 'dark' ? '#1f1f1f' : '#f4f4f4',
      symbolColor: theme === 'dark' ? '#ffffff99' : '#00000099',
      height: 42,
    })
  })
  ipcMain.handle(IpcChannel.ShellOpenExternal, async (event, input: unknown) => {
    assertSender(event.sender)
    if (typeof input !== 'string') throw new Error('Invalid external URL.')
    const url = new URL(input)
    if (!TRUSTED_EXTERNAL_ORIGINS.has(url.origin)) throw new Error('This URL is not allowed.')
    await shell.openExternal(url.toString())
  })
  ipcMain.handle(IpcChannel.LogsOpenDirectory, async (event) => {
    assertSender(event.sender)
    const error = await shell.openPath(services.logger.getLogsDirectory())
    if (error) throw new Error(error)
  })
  ipcMain.on(IpcChannel.LogWrite, (event, input: unknown) => {
    assertSender(event.sender)
    const parsed = rendererLogSchema.safeParse(input)
    if (parsed.success) {
      services.logger.writeRenderer({
        level: parsed.data.level,
        module: parsed.data.module,
        message: parsed.data.message,
        ...(parsed.data.details === undefined ? {} : { details: parsed.data.details }),
      })
    }
  })
  ipcMain.handle(IpcChannel.UpdatesCheck, async (event) => {
    assertSender(event.sender)
    await services.updater.checkForUpdates()
  })
  ipcMain.handle(IpcChannel.UpdatesInstall, async (event) => {
    assertSender(event.sender)
    await services.updater.quitAndInstall()
  })
}
