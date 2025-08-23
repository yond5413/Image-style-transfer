# gemin.md — Developer Style Guide (JS/TS/React/Next.js + Rust/WASM)

> GEMIN: **G**uidelines for **E**ngineering **M**ono-repo **I**ntegration & **N**orms — a concise, opinionated style guide tailored for the project (in-browser Rust→WASM style transfer using WebGPU).

---

## Purpose

This file is the single-source style & engineering convention for VibeCoding. It covers JavaScript/TypeScript, React, Next.js App Router, state management, UI, Rust/WASM interop patterns, build tooling, and deployment conventions. Follow this to keep the codebase consistent, maintainable, and performant.

---

## High level rules (apply everywhere)

* Be pragmatic and explicit: prefer readability and predictable behavior over clever one-liners.
* Small files and small functions: target <200 lines per file. Split when exceeded.
* Favor composition and pure functions; minimize side effects and global state.
* Document public module interfaces (short JSDoc / TSDoc) for exported hooks/components.

---

## Code style (Standard.js + TypeScript rules)

* Use Standard.js style rules with TypeScript additions.
* Indentation: 2 spaces.
* Strings: single quotes except to avoid escaping.
* Semicolons: omit semicolons (follow Standard.js), except where required.
* No unused variables or imports.
* Always use === / !==.
* Space keywords and before function parentheses: `function name () {}` for non-arrow functions.
* CamelCase for variables/functions; PascalCase for React components and types.
* Keep `else` on same line as closing brace when needed.
* Use explicit return types on exported functions.

> Tooling: ESLint (Standard config + TypeScript plugins), Prettier configured to not conflict with Standard rules. `npm run lint` must pass in CI.

---

## TypeScript config

* `tsconfig.json` must enable `strict`, `strictNullChecks`, `noImplicitAny`.
* Use `esModuleInterop: true` and `moduleResolution: 'bundler'` for Vite/Next compatibility.
* Prefer `interface` for object shapes and `type` for unions/primitives.
* Use `satisfies` and `as const` for manifest-like literals (model manifest, routes, themes).
* Prefer `unknown` over `any` and narrow via type guards.
* Use utility types (Partial, Pick, Omit) and generic interfaces where appropriate.

---

## React (App Router) conventions

* Default to Server Components; only use `use client` at the top of files that need it.

  * `use client` components should be as small as possible and only wrap interactions/UI needing browser APIs (canvas, file input, camera, WASM interop, etc.).
* Use `function` keyword for components: `export function UploadPanel (props: Props) {}`.
* Break large UIs into small, focused components (Upload, StylePicker, CanvasView, Controls, MetricsPanel).
* Prefer controlled components for forms and sliders (`Style Strength` slider controlled by state).
* Use `React.lazy` + `Suspense` for heavy client-only modules (WASM loader UI, webcam module).
* For server-side data (static manifest), use async Server Components with `fetch` and `cache` strategies (`revalidate` as needed).
* Implement `loading.js`, `error.js`, and `not-found.js` for routes where relevant.

---

## State management

* Use local component state where possible.
* Use Zustand for shared UI state (selectedStyleId, styleStrength, isWebcamOn, cachedModels list). Keep the store minimal and serializable.
* For complex flows (model load lifecycle), use a reducer pattern or small domain-specific hooks (e.g., `useModelLoader`) instead of stuffing logic into the global store.
* Store URL search params (via `nuqs`) for shareable state: selected style, strength, and mode (webcam vs upload).

---

## File and naming conventions

* Directories: lowercase with dashes, e.g. `components/upload-panel`, `hooks/use-model-loader`.
* Prefer named exports for React components and utilities.
* Keep files <200 lines; when a file grows, split into `Component.tsx`, `Component.helpers.ts`, `Component.hooks.ts`.
* Types: `types/` or colocated `types.ts` files for domain models. Export interfaces for model metadata (`ModelManifestEntry`).

---

## UI / Styling

* Use Tailwind CSS (mobile-first) and shadcn/ui + Radix primitives for accessible components.
* To add shadcn components: `npx shadcn@latest add` (e.g. `npx shadcn@latest add button`).
* Use Framer Motion for transitions on important UI elements (style cards, preview swap); prefer simple `motion.div` wraps and avoid heavy animation logic in render loops.
* Use utility classes and keep component-specific classes minimal. Put repeated styles into `ui/` components or `tailwind.config.js` tokens.
* Use CSS custom properties for theme colors and component spacing when necessary.

---

## Accessibility (a11y)

* Use semantic HTML and proper ARIA on custom widgets (e.g., slider, style list).
* Keyboard-first: all interactive controls reachable and operable by keyboard.
* Provide alt text for images and labels for form controls.
* Test with Lighthouse and a screen reader at least once before release.

---

## WASM / Rust interop patterns

* Keep the WASM interface minimal and binary-friendly.
* Expose these functions from Rust (`wasm-bindgen`) with stable JS-friendly signatures:

  * `init (modelBytes: ArrayBuffer): Promise<void>` — initializes model and GPU pipelines
  * `stylize (inputRgba: Uint8Array, width: number, height: number, strength: number): Uint8Array` — sync/async depending on runtime
  * `supportsWebGPU (): boolean`
  * `disposeModel (): void`
* Use shared `ArrayBuffer`/`Uint8Array` pools to avoid repeated allocations in hot paths (webcam frames).
* Prefer async initialization and return meaningful error messages. Surface those to the UI via a typed error object.
* Use `console_error_panic_hook` in dev builds to get stack traces for Rust panics.

---

## Model registry & manifest

* `public/models/manifest.json` must be `as const` typed in TS to get narrow types.
* Manifest entry interface example:

  ```ts
  export interface ModelManifestEntry {
    id: string
    name: string
    file: string
    sizeMb: number
    input: { name: string; shape: number[] }
    output: { name: string; shape: number[] }
    recommendedResolution: number
    hash?: string
  }
  ```
* Lazy-load models via `fetch` + `CacheStorage`. Use service worker runtime caching for persistence offline.

---

## Service worker & PWA

* App shell (HTML/JS/WASM/CSS) is precached at install. Models cached at runtime on first use.
* Use Workbox or a small custom SW. Prevent caching of user content (image uploads, webcam frames).
* Provide `offline` state UI: if a model is not cached and network unavailable, show friendly error and fallback.

---

## Next.js specific practices

* Put static `manifest.json` in `/public` and read from Server Component with `await fetch('/models/manifest.json')`.
* Keep heavy client code (WASM loader, Canvas, Webcam) under app routes as client components loaded with dynamic imports.
* Use Server Actions for any future server-side model management (not in v1 but leave hooks in code).
* Prefer `generateMetadata` for SEO on public pages, but keep the demo minimal and privacy-respecting.

---

## Performance & optimization

* Minimize `use client` and client bundles.
* Lazy-load WASM only when user attempts to stylize or enable webcam.
* Warm-up the WASM pipeline with a tiny dummy inference pass after model load.
* Use Web Workers for heavy JS tasks (e.g., image decoding/encoding) if CPU-bound.
* For webcam mode, adaptively downscale frames to hit target FPS; skip frames rather than queueing.

---

## Testing & CI

* Linting: ESLint (Standard + TypeScript) and `npm run lint` in CI.
* Unit tests: Jest / Vitest for TS logic and hooks. Keep WASM-bound logic covered via integration tests.
* E2E: Playwright for flows: upload, style select, strength change, download, offline behavior.
* Rust: `cargo fmt`, `cargo clippy`, `cargo test` run in CI. Ensure wasm build step `wasm-pack build` succeeds.

---

## Error handling and logging

* Handle errors early with guard clauses and typed error shapes. Surface user-friendly messages in UI.
* Log tool/debug messages at `debug` level; user-facing messages must be actionable.
* For WASM errors, translate low-level messages into friendly copy (e.g., "Model failed to load — try reloading or switching to a different style").

---

## Security

* Never send images to the network. Keep explicit warnings and confirmations when using camera.
* Use CSP headers; prefer `self` for scripts and disallow `unsafe-inline` where possible.
* Sanitize any user-provided text (if present) before inserting into the DOM.

---

## Useful snippets & commands

* Build WASM dev:

  ```bash
  cd rust
  wasm-pack build --target web --out-dir ../src/wasm/pkg
  ```
* Build production wasm (release):

  ```bash
  wasm-pack build --release --target web --out-dir ../src/wasm/pkg
  ```
* Run frontend dev server (Vite): `npm run dev`
* Add shadcn component: `npx shadcn@latest add` then pick components (button, cards, input)

---

## Onboarding checklist for new contributors

* [ ] Install Rust toolchain and `wasm-pack`
* [ ] `npm install` and `npm run dev` runs without errors
* [ ] Linting and tests pass locally (`npm run lint` / `npm run test`)
* [ ] Understand how to build and load a model via `useModelLoader` hook
* [ ] Read `gemin.md` and the PRD in the repo

---

## Where to relax the rules

* Prototyping branches may relax file size rules, but before merging to `main` refactor to conform.
* If a dependency enforces a different style (build tooling), wrap it with a thin adapter rather than adopt the style globally.

---

If you want, I can:

* add a `tsconfig.json` and `.eslintrc` snippet following these rules,
* generate a small component scaffold (UploadPanel + CanvasView + useModelLoader hook) following the guide,
* or enforce these rules in CI with example GitHub Actions.

Pick one and I will add it to the repo.
