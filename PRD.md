# Product Requirements Document (PRD)

## 1) Summary

A privacy-first, entirely in-browser image style transfer web app. Users upload a photo, pick a visual style (e.g., Van Gogh, Picasso, Cyberpunk), and instantly receive a stylized image. All inference happens locally via Rust→WebAssembly with WebGPU acceleration; no servers, no data leaves the device. Includes style-strength blending, side-by-side preview, offline support, and a webcam mode (bonus) for near real-time stylization.

---

## 2) Goals & Non‑Goals

**Goals**

* <1s perceived latency on small images (≤512×512) on modern laptops; ≤2s on mid‑tier phones.
* Fully client-side inference via WebGPU; zero server compute or uploads.
* Simple, delightful UI: upload, choose style, live preview, blend, download.
* Small on-disk/app footprint via lazy model loading + caching.

**Non‑Goals**

* Not targeting batch or multi-image automation workflows in v1.
* No account system or cloud storage in v1.
* No model training in-browser; models are pre-trained and exported to ONNX.

---

## 3) Personas

* **Creator Chloe (Designer/Student)**: Wants quick, stylized outputs for moodboards and posts, cares about privacy and speed.
* **Engineer Eli (Dev/Researcher)**: Curious about Rust/WASM/WebGPU; uses app as a reference implementation.
* **Content Marketer Maya**: Needs fast, on-brand stylistic transforms and simple downloads.

---

## 4) User Stories

1. As a user, I can upload a local image (PNG/JPG/WebP) and immediately preview it.
2. As a user, I can choose from multiple style models and see results side-by-side.
3. As a user, I can adjust **Style Strength** (0–100%) to blend original vs. stylized.
4. As a user, I can **Download PNG** of the stylized image.
5. As a user, I can **Reset** to the original image and clear selections.
6. As a user, I can continue to use the app **offline** after the first visit.
7. (Bonus) As a user, I can enable **Webcam Mode** to stylize live video with near real-time FPS.

---

## 5) Success Metrics / KPIs

* Time-to-first-stylized-frame (TTFSF):

  * Desktop: ≤1s @ 512×512
  * Mobile mid‑tier: ≤2s @ 384×384
* Model download size per style ≤8MB ideal (hard cap 20MB per model in v1).
* 95th percentile in‑app inference time (post-load) ≤50ms per frame @ 384×384 on desktop GPUs for webcam mode.
* First-load total bytes (WASM+JS+UI, excluding models) ≤3MB.
* Lighthouse PWA score ≥ 90.

---

## 6) Requirements

### 6.1 Functional

* **Upload & Preview**: Drag‑and‑drop or file picker, show original image with basic fit/crop.
* **Style Selection**: Choose 3–5 styles from a **Model Registry**. Lazy-load only the selected model.
* **Inference**: Run ONNX style-transfer model via Rust→WASM using WebGPU.
* **Blending**: Slider 0–100% to linearly blend original and stylized outputs.
* **Side-by-side View**: Responsive layout; tap to toggle single/compare views on mobile.
* **Actions**: Download PNG, Reset.
* **Offline**: Service Worker caches shell + selected models; app works without network after first load.
* **Errors & Fallbacks**: Graceful messages for unsupported browsers/devices; fallback to WebGL/CPU (optional, v1.1).
* **Webcam Mode (Bonus)**: Start/stop camera; target ≥10 FPS at 256–384px square on modern laptops.

### 6.2 Non‑Functional

* **Privacy**: No network I/O for images; ensure `crossOriginIsolated` where possible for performance APIs.
* **Performance**: Use WebGPU compute shaders via Rust `wgpu` and a Rust ONNX runtime (see Architecture) for GPU-accelerated inference.
* **Compatibility**: Chromium ≥115, Safari ≥17, Firefox ≥121 with WebGPU flags as applicable.
* **Accessibility**: Keyboard navigable, contrast AA, alt text for controls.
* **Internationalization**: English v1; structure for future locales.

---

## 7) System Architecture

**High-level:**

* **UI**: Minimal TypeScript + Web Components or a light framework (e.g., Preact/React). Interop with WASM via `wasm-bindgen`.
* **Inference Core (Rust→WASM)**:

  * **Option A (Preferred)**: Rust **wonnx** (WebGPU ONNX) for inference entirely in Rust targeting WebGPU via `wgpu`.
  * **Option B**: Hybrid—Rust for image I/O & post-processing; call `onnxruntime-web` (WebGPU backend) from TypeScript. (Keeps JS dependency; not pure Rust pipeline.)
* **Image Processing**: Rust `image` crate for resize/normalize; wasm-bindgen
  bindings to pass `ImageData`/`Uint8Array`.
* **Model Registry**: Static JSON manifest with model metadata (name, file path, tensor names, input size, recommended resolution, hash, size).
* **Storage & Caching**: Service Worker (Workbox or custom) caches `index.html`, WASM, JS bundles, CSS, and model binaries on demand; IndexedDB for model byte caching if needed.
* **Webcam**: `MediaDevices.getUserMedia` for frames → WebGPU pipeline; backpressure to keep latency low.

**Data Flow:**

1. User selects style → fetch model (if not cached) → instantiate runtime.
2. Preprocess uploaded image to model resolution (e.g., 256–512 square): resize, normalize, CHW/NCHW.
3. Run inference on GPU; receive stylized tensor.
4. Postprocess to RGBA `ImageData`.
5. Apply **Style Strength**: `out = lerp(original, stylized, alpha)`.
6. Render canvas; enable PNG export.

---

## 8) Model Registry

**Manifest Example (`models/manifest.json`)**

```json
{
  "version": 1,
  "models": [
    {
      "id": "vangogh_v1",
      "name": "Van Gogh",
      "file": "/models/vangogh_v1.onnx",
      "size_mb": 6.8,
      "input": { "name": "input", "shape": [1, 3, 512, 512], "dtype": "float32" },
      "output": { "name": "output", "shape": [1, 3, 512, 512], "dtype": "float32" },
      "recommended_resolution": 512,
      "hash": "sha256-..."
    },
    {
      "id": "picasso_v1",
      "name": "Picasso Cubist",
      "file": "/models/picasso_v1.onnx",
      "size_mb": 7.2,
      "input": { "name": "input", "shape": [1, 3, 384, 384], "dtype": "float32" },
      "output": { "name": "output", "shape": [1, 3, 384, 384], "dtype": "float32" },
      "recommended_resolution": 384,
      "hash": "sha256-..."
    },
    {
      "id": "cyberpunk_v1",
      "name": "Cyberpunk Neon",
      "file": "/models/cyberpunk_v1.onnx",
      "size_mb": 5.9,
      "input": { "name": "input", "shape": [1, 3, 256, 256], "dtype": "float32" },
      "output": { "name": "output", "shape": [1, 3, 256, 256], "dtype": "float32" },
      "recommended_resolution": 384,
      "hash": "sha256-..."
    }
  ]
}
```

**Constraints & Conventions**

* Prefer single-input/single-output feed-forward style transfer models (Johnson et al.).
* Use FP16 where possible; fall back to FP32 if device lacks support.
* Keep tensor names consistent across models to reduce glue logic.

---

## 9) UX / UI

* **Layout**: Header (title + offline badge); main two-column (Original | Stylized) on desktop; stacked with toggle on mobile.
* **Controls**:

  * File upload button + drag‑drop zone
  * Style dropdown (or card grid with preview thumbnails)
  * **Style Strength** slider (0–100%)
  * Actions: **Download PNG**, **Reset**, **Webcam** (bonus)
* **Status**: Model loading spinner with size; GPU backend name; offline indicator.
* **Errors**: Friendly copy with detection for unsupported WebGPU; suggest enabling experimental flags or updating browser.

---

## 10) Technical Design (Rust + WASM + WebGPU)

**Rust Crates**

* `wonnx` (ONNX inference on wgpu / WebGPU)
* `wgpu` (WebGPU abstraction)
* `wasm-bindgen`, `js-sys`, `web-sys` (interop)
* `image` (decode/resize/color ops) or `fast_image_resize`
* `console_error_panic_hook`, `wasm-logger` (dev tooling)

**Build Tooling**

* `wasm-bindgen` + `wasm-pack` or `cargo-component` (if using WASI components)
* Bundler: Vite/ESBuild (TypeScript UI)

**Key Routines**

* **Init**: Detect WebGPU; request adapter/device; init `wonnx::Session` with selected ONNX.
* **Preprocess**: `resize → to RGB → normalize (mean/std) → HWC→CHW → Float32/Float16`. Use GPU for resize (optional v1.1) to reduce CPU usage.
* **Inference**: Bind input buffer; dispatch compute; readback output.
* **Postprocess**: Convert tensor to `ImageData`; apply linear blend with original per pixel.
* **PNG Export**: Canvas `toBlob` or Rust PNG encoder writing to `Uint8Array` and `URL.createObjectURL`.

**Webcam Mode**

* Use `requestVideoFrameCallback` (where available) for cadence.
* Downscale frames to model resolution; keep a circular buffer for frame pacing.
* Dynamically adjust resolution to maintain target FPS (adaptive quality).

---

## 11) Platform & Compatibility

* Desktop: Chrome/Edge (stable WebGPU), Safari 17+ (macOS/iOS), Firefox (Nightly/flagged as needed).
* Mobile: iOS 17+ Safari; Android Chrome 115+.
* Graceful degradation: If WebGPU unsupported, show info and disable inference (no CPU fallback in v1 to keep scope tight).

---

## 12) Performance & Observability

* Warmup pass after model load to compile pipelines.
* Cache model binaries with `CacheStorage`; versioned URLs for invalidation.
* Use timer markers around preprocess/inference/postprocess; expose in a small dev panel (opt‑in).
* Memory cap heuristics: prevent >256MB GPU buffer allocations on mobile.

---

## 13) Security & Privacy

* No uploads; use `ObjectURL`/in‑memory blobs only.
* Limit camera access to explicit user action; stop tracks on exit.
* CSP with `wasm-unsafe-eval` as needed, minimal external origins.
* Service worker: avoid caching camera frames; cache only static assets & models.

---

## 14) Offline / PWA

* Installable PWA (manifest + icons).
* Service Worker precaches app shell; runtime caches model files on first use.
* Offline badge appears when network is unavailable; app remains functional for previously used styles.

---

## 15) File/Folder Structure (proposed)

```
/ (app root)
├── index.html
├── src/
│   ├── main.ts (UI bootstrap / WASM loader)
│   ├── ui/
│   │   ├── App.tsx
│   │   ├── Controls.tsx
│   │   └── CanvasView.tsx
│   └── wasm/
│       └── vibecoding_wasm_bg.wasm (built)
├── rust/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs (wasm-bindgen exports)
│       ├── infer.rs (wonnx session & runners)
│       └── image_ops.rs (pre/postprocess)
├── public/
│   ├── models/
│   │   ├── manifest.json
│   │   ├── vangogh_v1.onnx
│   │   ├── picasso_v1.onnx
│   │   └── cyberpunk_v1.onnx
│   ├── sw.js (service worker)
│   └── icons/* (PWA)
└── vite.config.ts
```

---

## 16) API / WASM Interface (example)

**Rust (wasm-bindgen)**

```rust
#[wasm_bindgen]
pub async fn init(model_bytes: Vec<u8>) -> Result<(), JsValue> { /* ... */ }

#[wasm_bindgen]
pub fn stylize(
  input_rgba: &[u8], width: u32, height: u32, strength: f32
) -> Result<Vec<u8>, JsValue> { /* returns RGBA bytes */ }

#[wasm_bindgen]
pub fn supports_webgpu() -> bool { /* ... */ }
```

**TypeScript**

```ts
await wasm.init(modelArrayBuffer);
const outRgba = wasm.stylize(imgRgba, w, h, strength);
canvas.putImageData(new ImageData(outRgba, w, h), 0, 0);
```

---

## 17) Acceptance Criteria

* ✅ Loads and runs at least **3 styles** from registry; each style lazy-loaded upon selection.
* ✅ Side-by-side preview, with **Style Strength** slider blending in real time.
* ✅ **Download PNG** outputs a file matching the preview resolution.
* ✅ **Reset** restores original image and clears style selection.
* ✅ **Offline**: After first load, app shell is cached; previously used model(s) run offline.
* ✅ **Metrics** panel shows per-stage timings (toggleable).
* ✅ (Bonus) Webcam mode achieves ≥10 FPS @ ≥256px on a 2021+ laptop.

---

## 18) Risks & Mitigations

* **WebGPU availability**: Some browsers/devices lack support → Detect & message clearly; list known-good browsers.
* **Model size**: Larger models hurt first-use latency → Quantize to FP16; consider 8‑bit weights if supported by runtime.
* **WASM↔JS copies**: Excessive memcpy → Use shared `Uint8Array` views; avoid redundant conversions.
* **Mobile thermals**: Sustained GPU use may throttle → Adaptive resolution; frame skipping for webcam.

---

## 19) Roadmap / Milestones

* **Week 1**: Project scaffolding, WebGPU feature detect, WASM build pipeline, basic UI with upload.
* **Week 2**: Integrate `wonnx`; load one ONNX model; E2E stylize a static image; implement blend + PNG download.
* **Week 3**: Model registry + lazy loading; service worker + offline; responsive side-by-side UI.
* **Week 4**: Performance pass; metrics panel; polish, a11y, PWA install; bonus webcam mode.

---

## 20) Rust/WebAssembly/WebGPU Learning Resources (curated)

**Rust**

* *The Rust Programming Language* ("The Book"): ownership, borrowing, lifetimes.
* *Rust by Example*: practical snippets.

**Rust × WebAssembly**

* *Rust and WebAssembly (rustwasm)*: wasm-bindgen, wasm-pack, passing data across the boundary.
* *wasm-bindgen Guide*: JS ↔ Rust interop patterns.

**WebGPU & wgpu**

* *WebGPU Fundamentals* or MDN WebGPU guide.
* *wgpu* examples & docs (the Rust-friendly WebGPU layer).

**ONNX in the Browser**

* *wonnx* (Rust ONNX on wgpu) — great fit for pure Rust/WASM.
* Alternative (hybrid): *onnxruntime-web* (JS) with WebGPU backend.

**Image Processing**

* `image` crate docs; `fast_image_resize` for efficient scaling.

**PWA/Offline**

* Workbox (service workers), MDN guides for CacheStorage/IndexedDB, web app manifests.

**Extras**

* WebAssembly debugging in Chrome DevTools; `console_error_panic_hook` to surface Rust panics.

---

## 21) Definition of Done (DoD)

* All acceptance criteria met.
* Automated CI build (Rust + UI), static analysis (clippy), and smoke tests pass.
* Tested on latest Chrome (desktop & Android) and Safari (macOS & iOS).
* Public demo page served statically; no server APIs required.
