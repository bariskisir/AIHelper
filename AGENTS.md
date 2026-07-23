# AIHelper — Development Guide

## Project Overview

AIHelper is an **Electron desktop application** for AI-powered text and image analysis. Users select screen regions, the app OCRs or analyzes them via ChatGPT, and streams results back in real-time.

## Tech Stack

| Layer      | Technology                             |
| ---------- | -------------------------------------- |
| Runtime    | Electron 43, Node.js >=24              |
| Frontend   | React 19, TypeScript 7, Ant Design 6   |
| State      | Redux Toolkit                          |
| i18n       | i18next + react-i18next (7 locales)    |
| Build      | Vite 8 + vite-plugin-electron          |
| Testing    | Vitest 4                               |
| Lint       | Biome                                  |
| Format     | Prettier                               |
| Validation | Zod 4                                  |
| OCR        | Tesseract.js                           |
| Packaging  | electron-builder (NSIS, DMG, AppImage) |

## Directory Structure

```
src/
  main/                          # Electron main process
    index.ts                     # App lifecycle, service composition, shortcuts
    ipc.ts                       # IPC handler registration & validation (Zod)
    ApplicationPaths.ts          # Electron path configuration
    settingsSchema.ts            # Settings Zod schemas + parsePersistedSettings
    security/
      RendererNavigationPolicy.ts # Restrictive renderer URL allowlist
    services/
      AiProviderService.ts       # Prompt/model/thinking resolution, delegates to ChatGPT
      AppUpdater.ts              # GitHub Releases update check + NSIS install
      ChatGptMetadata.ts         # Model catalog normalization, usage formatting
      ChatGptService.ts          # PKCE OAuth, token management, SSE streaming
      CredentialService.ts       # Encrypted API key + OAuth token storage
      ExportService.ts           # TXT/JSON session export
      GitHubReleaseClient.ts     # GitHub REST API release client
      LoggerService.ts           # electron-log daily rotating logs
      StorageService.ts          # JSON file persistence for settings + sessions
      WindowService.ts           # BrowserWindow creation, security, diagnostics
  preload/
    index.ts                     # contextBridge API exposed to renderer
  renderer/
    index.html                   # CSP-locked HTML shell
    src/
      entryPoint.tsx             # React mount with i18n init
      App.tsx                    # Shell: titlebar, sidebar, workspace, update notice
      context/
        AntdProvider.tsx         # Ant Design theme tokens + locale
        ThemeProvider.tsx         # System/user theme resolution
      hooks/
        useAppInit.ts            # Bootstrap + IPC event subscriptions
        useDesktopActions.ts     # External URLs, logs, updates
        useScanActions.ts        # Text/image scan triggers with auth guard
        useSettingsActions.ts    # Settings persistence queue + credentials
      i18n/                      # 7 locale files (en, tr, de, fr, pt, zh, es)
      components/
        app/
          AppSidebar.tsx         # Theme toggle, pin, settings buttons
          Titlebar.tsx           # Logo, sidebar toggle, compact mode
        sidebar/
          SessionsSidebar.tsx    # Session CRUD, export, context menus
      pages/
        home/
          HomePage.tsx           # Scan workspace: toolbar, I/O panes, prompt selectors
        settings/
          SettingsPage.tsx       # Settings shell with category navigation
          sections/
            AboutSettingsSection.tsx
            GeneralSettingsSection.tsx
            ProviderSettingsSection.tsx
            SystemPromptsSettingsSection.tsx
            UpdatesSettingsSection.tsx
      store/
        appSlice.ts              # Single Redux slice: settings, sessions, scan, updates
      services/
        LoggerService.ts         # Renderer → main log bridge
        SettingsPersistenceQueue.ts # Sequential settings write queue
      utils/
        formatters.ts            # formatDate, formatDuration
  shared/
    types.ts                     # All domain types, constants, DEFAULT_SETTINGS, AiHelperApi
    IpcChannel.ts                # IPC channel enum
    providers.ts                 # selectPreferredModelId
tests/                           # 11 test files, 110 tests
```

## Architecture Principles

### Three-Layer Separation

- **Main process** (`src/main/`): No DOM. File I/O, network, encryption, window management.
- **Preload** (`src/preload/`): Thin `contextBridge` wrapper — only the typed `AiHelperApi` is exposed.
- **Renderer** (`src/renderer/`): React SPA. Never imports `electron` directly.

### IPC Design

- All IPC channels enumerated in `IpcChannel` enum.
- Zod schemas validate every IPC payload at the handler boundary.
- `ipcMain.handle` for request/response, `ipcMain.on` for push events.
- The preload script exposes a strongly typed `window.aihelper` API matching `AiHelperApi`.

### State Flow

1. `app:bootstrap` loads settings + sessions + ChatGPT state → Redux `hydrate`.
2. User actions invoke `window.aihelper.*` → IPC → main process service → result.
3. Push events (`event:ai-result`, `event:chatgpt-state`, etc.) flow main → renderer.

## Commands

```bash
npm run dev          # Start Vite dev server + Electron
npm run build        # Typecheck + build all layers
npm run typecheck    # Run both Node and Web typechecks
npm test             # Run all tests (vitest run)
npm run test:watch   # Watch mode
npm run lint         # Biome lint
npm run format:check # Prettier dry-run
npm run format       # Prettier write
npm run package:win  # Build + NSIS installer (x64 + arm64)
```

## Coding Conventions

### TypeScript

- Strict mode enabled in both tsconfigs (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Path aliases: `@shared/*`, `@main/*`, `@renderer/*`.
- Two tsconfigs: `tsconfig.node.json` (main/preload/tests/shared) and `tsconfig.web.json` (renderer).

### Style

- 2-space indentation, LF line endings, UTF-8 (see `.editorconfig`).
- No semicolons, single quotes, trailing commas, 100 char width (see `.prettierrc.json`).
- Biome handles lint; Prettier handles format.

### JSDoc Comments

- Every file has a `/** ... */` header describing its role.
- Every exported function, class method has a `/** ... */` doc comment.
- Comments are in English.

### React

- All components are functional with hooks.
- Redux state via `useAppSelector` / `useAppDispatch` from `@renderer/store`.
- i18n via `useTranslation()` from `react-i18next`. Add new keys to `en.ts` first.
- SCSS modules follow `ComponentName.module.scss` convention.

### Services

- Main-process services are `export default class` with constructor injection.
- File I/O services (StorageService) use per-file operation locks to prevent races.
- Credentials use Electron's `safeStorage` encrypted persistence.

## Key Design Decisions

- **Single session model**: Each session holds exactly one scan `item` (not an array).
- **No legacy migration**: No Transcript → AIHelper data migration. Start fresh.
- **ChatGPT-only**: Only ChatGPT provider. No OpenCode, no custom providers.
- **Screen selection overlay**: Multi-display, fullscreen transparent `BrowserWindow` per display.
- **No Deepgram**: Voice transcription was removed; only screen capture + OCR.
- **Settings persistence**: Queued writes prevent rapid UI changes from race-conditioning.
- **No fallback models**: Models come exclusively from ChatGPT API. Empty on failure.
- **Codex version cache**: Fetched once from NPM, reused for app lifetime.

## Testing

- Run with `npm test` or `npx vitest run`.
- Tests run in Node environment (`vitest.config.ts`).
- Write tests alongside source in `tests/` directory.
- Mock external services (ChatGPT APIs, Electron APIs) with `vi.fn()`.
- Use real file I/O for StorageService tests with temporary directories.

## Adding Features

1. Define types in `src/shared/types.ts`.
2. Add IPC channel in `src/shared/IpcChannel.ts` if needed.
3. Add main-process handler in `src/main/ipc.ts` with Zod validation.
4. Expose in `src/preload/index.ts` via `AiHelperApi`.
5. Consume in renderer via `window.aihelper.*`.
6. Add i18n keys to all 7 locale files starting with `en.ts`.
7. Write tests in `tests/`.
