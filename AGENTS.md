# AIHelper -- Development Guide

## Project Overview

AIHelper is an Electron desktop application for AI-powered text and image analysis. Users select a screen region, the app captures it, optionally runs OCR via Tesseract, and sends the content to ChatGPT for a streamed response. Results are organised into persistent sessions and can be exported as TXT or JSON.

## Tech Stack

| Layer           | Technology                                                          |
| --------------- | ------------------------------------------------------------------- |
| Desktop Shell   | Electron 43, contextIsolation + sandboxed renderer                  |
| Frontend        | React 19, TypeScript 7, Antd 6, Redux Toolkit                       |
| Build           | Vite 8 with vite-plugin-electron                                    |
| Styling         | SCSS Modules                                                        |
| Validation      | Zod 4 (all IPC boundaries and persistence)                          |
| AI Provider     | ChatGPT (OAuth PKCE, SSE streaming)                                 |
| OCR             | Tesseract.js 7                                                      |
| Logging         | electron-log (main), custom bridge (renderer)                       |
| i18n            | i18next + react-i18next (7 locales)                                 |
| Testing         | Vitest 4, JSDOM                                                     |
| Linting         | Biome                                                               |
| Formatting      | Prettier                                                            |
| Packaging       | electron-builder (NSIS on Windows, DMG on macOS, AppImage on Linux) |
| Markdown Output | react-markdown                                                      |

## Directory Structure

```
AIHelper/
├── src/
│   ├── shared/                       # Cross-process contracts
│   │   ├── types.ts                  # All domain models, settings shape, IPC API type
│   │   ├── IpcChannel.ts             # IpcChannel enum -- every IPC channel name
│   │   └── appInfo.ts                # App author, repo URL constants
│   ├── main/                         # Electron main process (Node.js)
│   │   ├── index.ts                  # App lifecycle, single-instance lock, service wiring
│   │   ├── ipc.ts                    # All ipcMain.handle registrations + Zod validation
│   │   ├── ApplicationPaths.ts       # Configures appData/Data, Logs, Runtime, Session dirs
│   │   ├── settingsSchema.ts         # Shared Zod schemas for settings persistence
│   │   ├── security/
│   │   │   └── RendererNavigationPolicy.ts  # Navigation allowlist for the BrowserWindow
│   │   └── services/
│   │       ├── WindowService.ts      # BrowserWindow creation, security config, diagnostics
│   │       ├── StorageService.ts      # JSON file CRUD for settings + sessions with file locking
│   │       ├── CredentialService.ts   # OS-backed encryption for API keys + ChatGPT OAuth tokens
│   │       ├── ChatGptService.ts      # OAuth PKCE flow, token refresh, SSE streaming scans
│   │       ├── ChatGptMetadata.ts     # Normalises untrusted model catalog + usage payloads
│   │       ├── AiProviderService.ts   # Resolves models, prompts, thinking levels; delegates to ChatGPT
│   │       ├── LoggerService.ts       # Daily file logging with level-aware transports + pruning
│   │       ├── AppUpdater.ts          # GitHub release check, NSIS installer download + launch
│   │       ├── GitHubReleaseClient.ts # GitHub REST API client with version comparison + SHA-256 verification
│   │       └── ExportService.ts       # Renders sessions to TXT or JSON
│   ├── preload/
│   │   └── index.ts                  # contextBridge.exposeInMainWorld('app', typed API)
│   └── renderer/
│       ├── index.html                # HTML shell with #root mount point
│       └── src/
│           ├── entryPoint.tsx         # i18n init, Redux/Theme/Antd providers, React root mount
│           ├── App.tsx               # Shell layout: Titlebar + Sidebar + HomePage/SettingsPage + update notice
│           ├── store/
│           │   ├── index.ts          # configureStore, typed hooks (useAppDispatch, useAppSelector)
│           │   └── appSlice.ts       # Single Redux slice: settings, sessions, scan state, updates
│           ├── hooks/
│           │   ├── useAppInit.ts     # Bootstrap + subscribe to all main-to-renderer IPC events
│           │   ├── useScanActions.ts # scanText, scanImage, scanWithOverlay, cancelCurrentScan
│           │   ├── useSettingsActions.ts  # saveSettings (queued), saveApiKey, deleteApiKey
│           │   └── useDesktopActions.ts   # openExternal, openLogsDirectory, checkForUpdates, installUpdate
│           ├── services/
│           │   ├── LoggerService.ts       # RendererLogger that bridges to main via preload
│           │   └── SettingsPersistenceQueue.ts  # Serialises rapid settings patches to avoid races
│           ├── context/
│           │   ├── ThemeProvider.tsx # System/light/dark theme with CSS variables + native titlebar sync
│           │   └── AntdProvider.tsx  # Antd ConfigProvider with theme tokens + locale
│           ├── pages/
│           │   ├── home/
│           │   │   └── HomePage.tsx  # Text + image scan workspace with streaming output via ReactMarkdown
│           │   └── settings/
│           │       ├── SettingsPage.tsx    # Settings layout: section tabs + content
│           │       ├── components/
│           │       │   └── SettingLabel.tsx
│           │       └── sections/
│           │           ├── GeneralSettingsSection.tsx    # Language, theme, time format, compact mode, always-on-top
│           │           ├── ProviderSettingsSection.tsx   # ChatGPT sign-in, model selection, thinking, verbosity
│           │           ├── SystemPromptsSettingsSection.tsx  # Custom system prompt CRUD
│           │           ├── UpdatesSettingsSection.tsx    # Auto-update toggle, manual check, install
│           │           ├── LoggingSettingsSection.tsx    # Log level selector, open logs directory
│           │           └── AboutSettingsSection.tsx      # Version, author, repo link
│           ├── components/
│           │   ├── app/
│           │   │   ├── Titlebar.tsx     # Custom hidden-inset titlebar with drag region + page nav
│           │   │   └── AppSidebar.tsx    # Navigation sidebar (Home, Settings) + compact mode toggle
│           │   └── sidebar/
│           │       └── SessionsSidebar.tsx  # Session list: create, rename, delete, export, select
│           ├── i18n/
│           │   ├── index.ts            # i18next init with all locale resources
│           │   └── locales/            # en, tr, de, fr, pt, zh, es translation files
│           ├── utils/
│           │   └── formatters.ts       # formatDuration, formatDate utilities
│           └── assets/
│               └── styles/
│                   └── index.scss      # Global styles, CSS custom properties, scrollbar theming
├── tests/                             # Unit tests mirroring source structure
│   ├── appSlice.test.ts               # Redux reducer: hydration, scan lifecycle, session operations
│   ├── StorageService.test.ts         # In-memory file store mock, full CRUD coverage
│   ├── StorageService.test.ts         # File-based persistence with in-memory mock
│   ├── SettingsSchema.test.ts         # Zod schema parsing + fallback behaviour
│   ├── ChatGptMetadata.test.ts        # Model normalisation, usage formatting
│   ├── ExportService.test.ts          # TXT and JSON rendering
│   ├── LoggerService.test.ts          # Log level switching, error serialisation
│   ├── IpcChannel.test.ts             # Channel enum completeness
│   ├── Formatters.test.ts             # Date and duration formatting
│   ├── SettingsPersistenceQueue.test.ts # Queue serialisation
│   ├── RendererNavigationPolicy.test.ts # Navigation allowlist URL matching
│   └── providers.test.ts             # Provider configuration tests
├── vite.config.ts                     # Vite config: main/preload/renderer builds with aliases
├── vitest.config.ts                   # Vitest config: node environment with path aliases
├── tsconfig.json                      # References tsconfig.node.json + tsconfig.web.json
├── tsconfig.node.json                 # Main/preload TS: NodeNext, strict, @main/@shared/@renderer paths
├── tsconfig.web.json                  # Renderer TS: ESNext, react-jsx, @renderer/@shared paths
└── package.json                       # Scripts, deps, electron-builder config
```

## Commands

```bash
npm run dev         # Start Vite dev server + Electron (hot-reload for renderer)
npm start           # Preview the production build
npm run build       # Full typecheck + production Vite build
npm run typecheck   # Run both node and web TypeScript checks
npm run lint        # Biome lint on src, tests, and config files
npm run format      # Prettier write on all files
npm run format:check # Prettier check only
npm run test        # Vitest single run (unit tests)
npm run test:watch  # Vitest in watch mode
npm run package     # Build + electron-builder --dir (unpacked for debugging)
npm run package:win # Build + NSIS installers for both x64 and arm64
npm run release     # Alias for package:win
```

## Architecture

### Three-Layer Separation

```
Renderer (sandboxed, contextIsolation: true)
    ↕  contextBridge.exposeInMainWorld('app', api)
Preload (typed AiHelperApi contract)
    ↕  ipcRenderer.invoke / ipcMain.handle + Zod validation
Main Process (Node.js, full system access)
```

- **Renderer**: React 19 + Redux, has zero direct access to Node or Electron APIs. All system interaction goes through `window.app.*` (the preload bridge).
- **Preload**: Exposes a typed `AiHelperApi` object (defined in `src/shared/types.ts`) via `contextBridge`. Every method maps to a specific `IpcChannel` enum value.
- **Main process**: All `ipcMain.handle` registrations validate the sender (`assertSender` checks `webContents.id`), parse payloads with Zod schemas, delegate to service classes, and return validated results.

### IPC Design

- Every IPC channel is enumerated in `src/shared/IpcChannel.ts` as a string enum so the renderer, preload, and main process share a single source of truth.
- Request-response channels use `ipcRenderer.invoke` / `ipcMain.handle` (promise-based).
- Push events from main to renderer use `webContents.send` (e.g. `event:ai-result`, `event:session-updated`).
- The renderer writes logs via `ipcRenderer.send` (fire-and-forget `logs:write` channel).
- All handler inputs are validated with Zod before touching any service. Unknown input is rejected at the boundary.
- Each handler calls `assertSender(event.sender)` to prevent compromised renderers or webviews from invoking sensitive operations.

### State Flow

```
[Main Process Boot]
  → StorageService loads settings + sessions
  → ChatGptService restores auth state + refreshes models
  → BootstrapPayload assembled and returned to renderer

[Renderer Boot]
  → useAppInit calls window.app.bootstrap()
  → Redux hydrate() action fills all initial state
  → IPC event listeners registered (AiResult, SessionUpdated, ChatGptState, etc.)

[Scan Flow]
  → User clicks "Scan Text" or presses Ctrl+Shift+T
  → Renderer calls window.app.requestScreenSelection('text')
  → Main process creates transparent overlay BrowserWindows on all displays
  → User drags a selection rectangle → selected region captured via desktopCapturer
  → Data URL returned to renderer (shown as preview)
  → Renderer calls window.app.scanText({ text, imageDataUrl, settings })
  → IPC handler runs optional OCR, creates a session, builds the scan item
  → AiProviderService resolves model + prompt + thinking level
  → ChatGptService.streamScan opens SSE stream to ChatGPT
  → Deltas pushed to renderer via event:ai-result (appendScanOutput actions)
  → On completion: session item persisted, SessionUpdated event sent
  → Renderer loads the full session document from the event
```

### Service Architecture

Each main-process service is a plain TypeScript class with explicit constructor injection:

- **WindowService** -- Owns the single `BrowserWindow`. Configures sandbox, preload, CSP, navigation security. Monitors for failed loads and renderer crashes.
- **StorageService** -- File-based persistence under `%APPDATA%/AIHelper/Data/`. Settings in `settings.json`, sessions as individual `{uuid}.json` files. Uses an in-memory serialisation queue per file path (`withFileLock`) to prevent interleaved writes. Validates all reads and writes through Zod.
- **CredentialService** -- Wraps Electron's `safeStorage` for OS-level encryption. Stores API keys and ChatGPT OAuth tokens in `credentials.bin` and `chatgpt_auth.bin`.
- **ChatGptService** -- Full OAuth PKCE flow: starts a local HTTP server on port 1455, opens the system browser for authorisation, exchanges the code for tokens, refreshes automatically. Streams scan responses via SSE from `chatgpt.com/backend-api/codex/responses`. Discovers models from the Codex catalog and normalises them via `ChatGptMetadata`.
- **AiProviderService** -- Thin orchestration layer. Resolves effective model, system prompt, and thinking level from settings for each scan mode. Delegates streaming to `ChatGptService`.
- **LoggerService** -- Creates two `electron-log` instances (general + error-only). Daily rotation, 10 MB max per file, automatic pruning (30 days general, 60 days error). Receives renderer log entries via the `logs:write` IPC channel.
- **AppUpdater** -- Polls the GitHub Releases API for the latest stable release. Compares semantic versions. Downloads the architecture-specific NSIS installer, verifies SHA-256 digest, and spawns the installer with `/S --updated --force-run`.
- **GitHubReleaseClient** -- Fetches and validates GitHub REST API responses with Zod. Parses semantic versions, selects the correct platform asset, streams downloads with progress reporting, and verifies file size and checksum.

## Coding Conventions

### TypeScript

- Strict mode enabled in both `tsconfig.node.json` and `tsconfig.web.json`.
- `noUncheckedIndexedAccess: true` -- all array/object index accesses must handle `undefined`.
- `exactOptionalPropertyTypes: true` -- `undefined` is distinct from missing.
- Path aliases: `@main/*`, `@shared/*`, `@renderer/*` configured in both Vite and TypeScript.
- Use `type` imports for type-only references. Avoid default exports for utilities; prefer named exports.
- Zod schemas for every cross-process boundary: settings, session items, IPC payloads, GitHub API responses, renderer log entries.

### Style

- Biome for linting, Prettier for formatting. No ESLint, no conflicting config.
- SCSS Modules for component styling (`.module.scss` files). Global styles in `assets/styles/index.scss`.
- CSS custom properties for theming; dark/light modes driven by the ThemeProvider context.

### React

- Functional components with hooks exclusively.
- Single Redux slice (`appSlice`) with typed `useAppDispatch` and `useAppSelector` hooks.
- Code-split settings page with `React.lazy` + `Suspense`.
- Custom hooks encapsulate all preload API calls (`useAppInit`, `useScanActions`, `useSettingsActions`, `useDesktopActions`). Page components never call `window.app` directly.
- Antd's `App.useApp()` for message/notification APIs in hooks (avoid static `message.error` which breaks in StrictMode).

### Services

- Main-process services are plain classes with constructor injection -- no DI framework.
- Services that own mutable state expose getters that return copies (e.g. `getState()` returns `structuredClone`).
- Renderer services are lightweight: `SettingsPersistenceQueue` serialises writes, `RendererLogger` bridges to main.
- File operations in StorageService are serialised per path via an in-memory promise chain (`withFileLock`).
- All file I/O is validated on write (Zod parse before `writeFile`) and on read (Zod parse after `readFile`).

### JSDoc

- Every file starts with a brief JSDoc comment describing its responsibility.
- Every exported class, function, and interface has a JSDoc description.
- Internal helper functions use single-line descriptions for clarity.

## Key Design Decisions

- **Single Redux slice**: The entire renderer state lives in one `appSlice` rather than multiple slices, because settings, sessions, and scan state are tightly coupled (scan requires settings, session creation triggers updates).
- **File-based session storage**: Each session is a separate `{uuid}.json` file sorted by filename (UUIDs contain timestamps). No SQLite dependency -- simple, debuggable, portable.
- **Per-file serialisation queue**: `StorageService.withFileLock` maintains a promise chain per file path, ensuring concurrent renderer operations never interleave writes without a global mutex.
- **Screen selection via transparent BrowserWindows**: One fullscreen transparent window per display with inline HTML/JS for selection. The main window hides during selection to avoid blocking. Keyboard handling is split between the overlay's inline script and the main process's `before-input-event` listener (for reliability on Windows).
- **ChatGPT as the sole AI provider**: The architecture supports multiple providers in theory (`AiProviderService` is provider-agnostic), but currently only ChatGPT is implemented via `ChatGptService`.
- **OCR as optional preprocessing**: When a text scan includes a captured image, Tesseract runs first. If OCR produces text, it replaces the user input; otherwise the original (potentially empty) input is used.
- **Settings persistence with fallback**: `parsePersistedSettings` attempts safe parsing, falling back field-by-field to defaults. This ensures the app never bricks on corrupted settings.
- **Zod at every boundary**: Every IPC input is validated. Every file read is parsed through a Zod schema. Untrusted external data (GitHub API, ChatGPT model catalog, usage payloads) is normalised with defensive `asObject`/`stringValue`/`numericValue` guards.
- **Native titlebar overlay**: Uses Electron's `titleBarStyle: 'hidden'` + `titleBarOverlay` for a custom look that still supports native window controls.
- **Update delivery via GitHub Releases**: No external update server. The updater directly polls the GitHub API, downloads the NSIS installer, verifies its SHA-256 digest, and launches it silently.
- **Deterministic tests via constructor injection**: `AppUpdater`, `GitHubReleaseClient`, and `StorageService` accept injectable dependencies (fetcher, runtime, fs module) so tests can mock them without patching globals.

## Testing

- **Framework**: Vitest 4 with `environment: 'node'` and JSDOM for DOM-dependent renderer tests.
- **Path aliases**: `@main/*`, `@shared/*`, `@renderer/*` resolved in `vitest.config.ts`.
- **Test files**: 11 test files in `tests/` covering:
  - `appSlice.test.ts` -- Redux reducer state transitions
  - `StorageService.test.ts` -- File CRUD with in-memory mock of `fs/promises`
  - `SettingsSchema.test.ts` -- Zod schema parsing and fallback behaviour
  - `ChatGptMetadata.test.ts` -- Model normalisation edge cases
  - `ExportService.test.ts` -- TXT/JSON rendering
  - `LoggerService.test.ts` -- Log level changes and error serialisation
  - `IpcChannel.test.ts` -- Channel enum covers all preload API methods
  - `Formatters.test.ts` -- Date and duration formatting
  - `SettingsPersistenceQueue.test.ts` -- Concurrent write serialisation
  - `RendererNavigationPolicy.test.ts` -- URL allowlist matching
  - `providers.test.ts` -- Provider configuration
- Services that depend on external I/O are designed with injectable constructors so unit tests can supply mocks without `vi.mock` on globals. Tests mocking Node built-ins (`fs/promises`, `crypto`) use `vi.mock` at the top of the test file.
- Run with `npm test` (single run) or `npm run test:watch` (watch mode).
- No E2E or integration tests currently exist.
