/**
 * Enumerates every IPC channel exposed by the desktop application.
 */

export enum IpcChannel {
  AppBootstrap = 'app:bootstrap',
  SettingsSave = 'settings:save',
  CredentialsSave = 'credentials:save',
  CredentialsGet = 'credentials:get',
  CredentialsDelete = 'credentials:delete',
  AiScanText = 'ai:scan-text',
  AiScanImage = 'ai:scan-image',
  AiCancel = 'ai:cancel',
  SessionList = 'session:list',
  SessionCreate = 'session:create',
  SessionRename = 'session:rename',
  SessionDelete = 'session:delete',
  SessionDeleteAll = 'session:delete-all',
  SessionExport = 'session:export',
  WindowAlwaysOnTop = 'window:always-on-top',
  ThemeSet = 'theme:set',
  ShellOpenExternal = 'shell:open-external',
  LogsOpenDirectory = 'logs:open-directory',
  LogWrite = 'logs:write',
  UpdatesCheck = 'updates:check',
  UpdatesInstall = 'updates:install',
  AiResult = 'event:ai-result',
  SessionUpdated = 'event:session-updated',
  AppError = 'event:error',
  UpdateState = 'event:update-state',
  ChatGptState = 'event:chatgpt-state',
}
