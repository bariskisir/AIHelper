# Repository Guidelines

## Project Structure & Module Organization

AIHelper is an Electron desktop application built with Vite, TypeScript, and React. Keep process-specific code separated:

- `src/main/` contains Electron startup, IPC, security policies, and native services.
- `src/preload/` exposes the narrow bridge between Electron and the renderer.
- `src/renderer/src/` contains the React UI: pages, components, Redux store, hooks, styles, and translations.
- `src/shared/` holds types, provider definitions, IPC channel names, and other code shared across processes.
- `tests/` contains Vitest unit tests. `build/` holds icons; `images/` holds README screenshots.

Use the configured aliases (`@main`, `@shared`, and `@renderer`) where they make imports clearer.

## Build, Test, and Development Commands

Use Node.js 24 or newer and install dependencies with `npm ci`.

- `npm run dev` starts the local Vite/Electron development workflow.
- `npm run typecheck` checks both Node/Electron and web TypeScript projects.
- `npm run lint` runs Biome against source and tests.
- `npm run format:check` verifies Prettier formatting; `npm run format` applies it.
- `npm test` runs the Vitest suite once; `npm run test:watch` is for iterative work.
- `npm run build` type-checks and produces the production build. Use `npm run package:win` or `npm run package:linux` for packages.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, single quotes, no semicolons, and trailing commas in multiline structures. Let Prettier and Biome settle formatting. Use `PascalCase` for React components and classes (for example, `StorageService.ts`), `camelCase` for functions and variables, and `*.module.scss` for component-scoped styles. Keep IPC contracts and shared types in `src/shared/`; validate untrusted or persisted data at process boundaries.

## Testing Guidelines

Write focused Vitest tests in `tests/` using the `*.test.ts` suffix. Name `describe` blocks after the unit or behavior and use readable `it(...)` statements, such as `it('loads safe defaults')`. Add or update tests whenever changing services, schemas, reducer behavior, IPC, or security policies. There is no stated coverage threshold; run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check` before opening a PR.

## Commit & Pull Request Guidelines

Match the history's Conventional Commit pattern: `feat:`, `fix(providers):`, `chore:`, or `build(deps-dev):`, with a brief imperative summary. Keep commits scoped. PRs should explain the change, link related issues, list validation, and include screenshots for UI changes. Do not commit credentials, tokens, local data, or release artifacts.
