/**
 * Composes main-process services and controls the AIHelper application lifecycle.
 */

import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { configureApplicationPaths } from './ApplicationPaths'
import { registerIpc } from './ipc'
import AiProviderService from './services/AiProviderService'
import AppUpdater from './services/AppUpdater'
import ChatGptService from './services/ChatGptService'
import CredentialService from './services/CredentialService'
import LoggerService from './services/LoggerService'
import StorageService from './services/StorageService'
import WindowService from './services/WindowService'

const windowService = new WindowService()
const applicationPaths = configureApplicationPaths()
const hasSingleInstanceLock = app.requestSingleInstanceLock()
let loggerService: LoggerService | null = null

/** Creates all services and binds them to a newly opened window. */
const openApplicationWindow = async (): Promise<void> => {
  const storage = new StorageService(applicationPaths.dataRoot)
  await storage.initialize()
  const settings = await storage.loadSettings()
  const logger = new LoggerService(applicationPaths.logsRoot, settings.logLevel)
  loggerService = logger
  const credentials = new CredentialService(join(applicationPaths.dataRoot, 'credentials.bin'))
  const chatGpt = new ChatGptService(
    credentials,
    {
      onState: (state) =>
        windowService.getMainWindow()?.webContents.send('event:chatgpt-state', state),
    },
    logger,
  )
  await chatGpt.initialize()
  const aiProvider = new AiProviderService(chatGpt, logger)
  const updater = new AppUpdater(logger)
  const window = await windowService.createWindow(logger)

  registerIpc(window, {
    storage,
    credentials,
    chatGpt,
    aiProvider,
    updater,
    logger,
  })

  /** Registers a global keyboard shortcut if it has not already been bound. */
  const reg = (key: string, cb: () => void) => {
    if (!globalShortcut.isRegistered(key)) {
      const ok = globalShortcut.register(key, cb)
      if (!ok) logger.warn('Application', `Failed to register shortcut: ${key}`)
    }
  }
  // Register global shortcuts for scan operations
  const { globalShortcut } = await import('electron')
  // Unbind DevTools shortcut first
  globalShortcut.unregister('CommandOrControl+Shift+I')
  reg('CommandOrControl+Shift+T', () => window.webContents.send('shortcut', 'scan-text'))
  reg('CommandOrControl+Shift+Y', () => window.webContents.send('shortcut', 'scan-image'))
  reg('CommandOrControl+Shift+1', () => window.webContents.send('shortcut', 'repeat-text'))
  reg('CommandOrControl+Shift+2', () => window.webContents.send('shortcut', 'repeat-image'))
  logger.info('Application', 'AI Helper desktop started.', {
    version: app.getVersion(),
    platform: process.platform,
  })
  if (settings.autoUpdate && app.isPackaged) {
    void updater.checkForUpdates().catch((error: unknown) => {
      logger.warn('Application', 'Startup update check failed.', error)
    })
  }
}

/** Opens a replacement macOS window and records initialization failures. */
const reopenApplicationWindow = (): void => {
  void openApplicationWindow().catch((error: unknown) => {
    loggerService?.error('Application', 'Application window could not be reopened.', error)
  })
}

// Log uncaught exceptions and unhandled rejections through the logger.
process.on('uncaughtException', (error) =>
  loggerService?.error('Application', 'Uncaught exception.', error),
)
process.on('unhandledRejection', (error) =>
  loggerService?.error('Application', 'Unhandled rejection.', error),
)

// Enforce single-instance lock; bring the existing window to front on second launch.
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = windowService.getMainWindow()
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  void app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId('com.bariskisir.aihelper')
      await openApplicationWindow()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) reopenApplicationWindow()
      })
    })
    .catch((error: unknown) => {
      loggerService?.error('Application', 'Application initialization failed.', error)
      app.quit()
    })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
