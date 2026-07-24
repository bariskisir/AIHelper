/**
 * Owns the main Electron window, navigation policy, and security boundary.
 */

import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { isTrustedRendererNavigation } from '../security/RendererNavigationPolicy'
import type LoggerService from './LoggerService'

export default class WindowService {
  private mainWindow: BrowserWindow | null = null
  private readonly rendererPath = join(__dirname, '../renderer/index.html')

  /** Returns the active main window when it is still alive. */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  /** Creates and loads a hardened desktop window. */
  public async createWindow(logger: LoggerService): Promise<BrowserWindow> {
    const window = new BrowserWindow({
      width: 1180,
      height: 760,
      minWidth: 450,
      minHeight: 300,
      show: false,
      backgroundColor: '#181818',
      title: 'AI Helper',
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#1f1f1f', symbolColor: '#ffffff99', height: 42 },
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        devTools: !app.isPackaged,
        partition: `${app.name}-session`,
      },
    })
    this.mainWindow = window
    this.configureRendererDiagnostics(window, logger)
    this.configureSecurity(window)
    window.once('ready-to-show', () => window.show())
    window.once('closed', () => {
      if (this.mainWindow === window) this.mainWindow = null
    })
    await this.loadRenderer(window)
    return window
  }

  /** Records packaged renderer load, preload, console, and process failures in AppData logs. */
  private configureRendererDiagnostics(window: BrowserWindow, logger: LoggerService): void {
    window.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (!isMainFrame) return
        logger.error('WindowService', 'Renderer document failed to load.', {
          errorCode,
          errorDescription,
          validatedUrl,
        })
      },
    )
    window.webContents.on('preload-error', (_event, preloadPath, error) => {
      logger.error('WindowService', 'Renderer preload failed.', { preloadPath, error })
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      logger.error('WindowService', 'Renderer process exited unexpectedly.', details)
    })
    window.webContents.on('console-message', (details) => {
      if (details.level !== 'error') return
      logger.error('RendererConsole', details.message, {
        source: details.sourceId,
        line: details.lineNumber,
      })
    })
    window.webContents.on('did-finish-load', () => {
      setTimeout(() => void this.verifyRendererMounted(window, logger), 1_000)
    })
  }

  /** Detects an empty React root so a packaged gray screen leaves an actionable log entry. */
  private async verifyRendererMounted(window: BrowserWindow, logger: LoggerService): Promise<void> {
    if (window.isDestroyed()) return
    try {
      const childCount = await window.webContents.executeJavaScript(
        "document.getElementById('root')?.childElementCount ?? 0",
        true,
      )
      if (childCount === 0) {
        logger.error('WindowService', 'Renderer finished loading without mounting the application.')
      }
    } catch (error) {
      logger.error('WindowService', 'Renderer health check failed.', error)
    }
  }

  /** Loads the Vite development server or packaged renderer document. */
  private async loadRenderer(window: BrowserWindow): Promise<void> {
    const developmentUrl = process.env.VITE_DEV_SERVER_URL
    if (developmentUrl) await window.loadURL(developmentUrl)
    else await window.loadFile(this.rendererPath)
  }

  /** Blocks popups and navigation outside the bundled renderer. */
  private configureSecurity(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      if (!this.isTrustedRendererUrl(url)) event.preventDefault()
    })
  }

  /** Accepts only the packaged file or exact Vite development origin. */
  private isTrustedRendererUrl(url: string): boolean {
    return isTrustedRendererNavigation(url, this.rendererPath, process.env.VITE_DEV_SERVER_URL)
  }
}
