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

*   **UI (Controller)**: A TypeScript-based React application responsible for state management, user interaction, and orchestrating the overall application flow.
*   **Inference Engine (JS)**: Uses the `onnxruntime-web` library to load and execute style transfer models. It leverages the WebGPU backend for high-performance, in-browser inference.
*   **Image Processing Worker (Rust→WASM)**: A headless Rust library compiled to WebAssembly. It exposes a minimal set of high-performance functions for CPU-bound image manipulation tasks (pre- and post-processing).
*   **Model Registry**: A static JSON manifest (`public/models/manifest.json`) that provides metadata for each available style transfer model.
*   **Storage & Caching**: A Service Worker caches the application shell (HTML, JS, CSS, WASM) and model files on demand, enabling offline functionality.

**Data Flow:**

1.  **Load**: The user uploads an image. The JS Controller reads it into an `ArrayBuffer`.
2.  **Pre-process (JS → WASM)**: The `ArrayBuffer` is passed to the Rust/WASM worker. This is a zero-copy operation. The Rust code decodes, resizes, and normalizes the image into a `Float32Array` tensor.
3.  **Inference (JS)**: The tensor is returned to the JS Controller, which feeds it into the `onnxruntime-web` inference session running on WebGPU.
4.  **Post-process (JS → WASM)**: The output tensor from the model is passed back to the Rust/WASM worker, along with the original image data for blending.
5.  **Render (JS)**: The final, stylized RGBA pixel data is returned to the JS Controller as a `Uint8Array` and rendered to a `<canvas>`.

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

*   Prefer single-input/single-output feed-forward style transfer models (Johnson et al.).
*   Use FP16 where possible; fall back to FP32 if device lacks support.
*   Keep tensor names consistent across models to reduce glue logic.

---

## 9) UX / UI

*   **Layout**: Header (title + offline badge); main two-column (Original | Stylized) on desktop; stacked with toggle on mobile.
*   **Controls**:
    *   File upload button + drag‑drop zone
    *   Style dropdown (or card grid with preview thumbnails)
    *   **Style Strength** slider (0–100%)
    *   Actions: **Download PNG**, **Reset**, **Webcam** (bonus)
*   **Status**: Model loading spinner with size; GPU backend name; offline indicator.
*   **Errors**: Friendly copy with detection for unsupported WebGPU; suggest enabling experimental flags or updating browser.

---

## 10) Technical Design (Rust + WASM + WebGPU)

**Core JavaScript Libraries**

*   `onnxruntime-web`: For ONNX model inference using the WebGPU backend.
*   `react`, `react-dom`: For building the user interface.
*   `tailwindcss`: For styling.

**Rust Crates**

*   `wasm-bindgen`, `js-sys`, `web-sys`: For JS ↔ WASM interop.
*   `image`: For decoding, resizing, and color operations.
*   `console_error_panic_hook`: For improved debugging.

**Build Tooling**

*   `wasm-pack`: For building the Rust/WASM worker module.
*   `next.js` (or Vite): For bundling the TypeScript/React UI.

**Key Routines**

*   **Init**: The JS Controller detects WebGPU support and initializes the `onnxruntime-web` inference session with the selected ONNX model.
*   **Preprocess (WASM)**: A Rust function (`preprocess_image`) is called from JS with the raw image bytes. It decodes, resizes, normalizes, and converts the image to a `Float32Array` tensor.
*   **Inference (JS)**: The JS Controller runs the model on the GPU via `onnxruntime-web`.
*   **Postprocess (WASM)**: A Rust function (`postprocess_image`) is called from JS with the output tensor and original image data. It performs a linear blend based on style strength and returns the final RGBA pixel data.
*   **Render (JS)**: The JS Controller renders the final pixel data to a `<canvas>`.

**Webcam Mode**

*   Use `MediaDevices.getUserMedia` to get video frames.
*   For each frame, run the same preprocess → inference → postprocess → render pipeline.
*   Use `requestVideoFrameCallback` for efficient scheduling and backpressure management to maintain a stable FPS.

---

## 11) Platform & Compatibility

*   Desktop: Chrome/Edge (stable WebGPU), Safari 17+ (macOS/iOS), Firefox (Nightly/flagged as needed).
*   Mobile: iOS 17+ Safari; Android Chrome 115+.
*   Graceful degradation: If WebGPU unsupported, show info and disable inference (no CPU fallback in v1 to keep scope tight).

---

## 12) Performance & Observability

*   Warmup pass after model load to compile pipelines.
*   Cache model binaries with `CacheStorage`; versioned URLs for invalidation.
*   Use timer markers around preprocess/inference/postprocess; expose in a small dev panel (opt‑in).
*   Memory cap heuristics: prevent >256MB GPU buffer allocations on mobile.

---

## 13) Security & Privacy

*   No uploads; use `ObjectURL`/in‑memory blobs only.
*   Limit camera access to explicit user action; stop tracks on exit.
*   CSP with `wasm-unsafe-eval` as needed, minimal external origins.
*   Service worker: avoid caching camera frames; cache only static assets & models.

---

## 14) Offline / PWA

*   Installable PWA (manifest + icons).
*   Service Worker precaches app shell; runtime caches model files on first use.
*   Offline badge appears when network is unavailable; app remains functional for previously used styles.

---

## 15) File/Folder Structure (proposed)

```
/ (app root)
├── package.json
├── next.config.js
├── src/
│   ├── app/
│   │   └── page.tsx (Main React component)
│   ├── components/
│   │   ├── Controls.tsx
│   │   └── CanvasView.tsx
│   └── wasm/
│       └── (built wasm package from rust)
├── rust/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs (wasm-bindgen exports)
│       └── image_ops.rs (pre/postprocess logic)
├── public/
│   ├── models/
│   │   ├── manifest.json
│   │   ├── vangogh_v1.onnx
│   │   └── ...
│   └── icons/* (PWA)
└── tsconfig.json
```

---

## 16) API / WASM Interface (example)

**Rust (`lib.rs`)**

```rust
#[wasm_bindgen]
pub fn preprocess_image(image_bytes: &[u8], width: u32, height: u32) -> Result<Float32Array, JsValue> {
    // ...
}

#[wasm_bindgen]
pub fn postprocess_image(output_tensor: Float32Array, original_image_bytes: &[u8], strength: f32) -> Result<Uint8Array, JsValue> {
    // ...
}
```

**TypeScript (React Component)**

```ts
import { InferenceSession } from 'onnxruntime-web/webgpu';
import * as wasm from '../wasm/pkg';

// In an async function:
const session = await InferenceSession.create('./models/model.onnx', { executionProviders: ['webgpu'] });
const tensor = wasm.preprocess_image(imageBytes, 512, 512);
const results = await session.run({ input: tensor });
const outputRgba = wasm.postprocess_image(results.output, imageBytes, 0.8);
canvasContext.putImageData(new ImageData(outputRgba, 512, 512), 0, 0);
```

---

## 17) Acceptance Criteria

*   ✅ Loads and runs at least **3 styles** from registry; each style lazy-loaded upon selection.
*   ✅ Side-by-side preview, with **Style Strength** slider blending in real time.
*   ✅ **Download PNG** outputs a file matching the preview resolution.
*   ✅ **Reset** restores original image and clears style selection.
*   ✅ **Offline**: After first load, app shell is cached; previously used model(s) run offline.
*   ✅ **Metrics** panel shows per-stage timings (toggleable).
*   ✅ (Bonus) Webcam mode achieves ≥10 FPS @ ≥256px on a 2021+ laptop.

---

## 18) Risks & Mitigations

*   **WebGPU availability**: Some browsers/devices lack support → Detect & message clearly; list known-good browsers.
*   **Model size**: Larger models hurt first-use latency → Quantize to FP16; consider 8‑bit weights if supported by runtime.
*   **WASM↔JS copies**: Excessive memcpy → Use shared `Uint8Array` views; avoid redundant conversions.
*   **Mobile thermals**: Sustained GPU use may throttle → Adaptive resolution; frame skipping for webcam.

---

## 19) Roadmap / Milestones

*   **Week 1**: Project scaffolding (Next.js + Rust/WASM), `onnxruntime-web` setup, WebGPU feature detection, basic UI with image upload.
*   **Week 2**: Implement WASM pre- and post-processing functions. Integrate `onnxruntime-web` to achieve a full E2E style transfer on a single static image.
*   **Week 3**: Implement model registry, lazy loading, and style selection UI. Implement blending slider and PNG download.
*   **Week 4**: Implement Service Worker for offline caching. Polish UI/UX, add metrics panel, and address accessibility.
*   **Bonus**: Implement webcam mode with adaptive quality.

---

## 20) Rust/WebAssembly/WebGPU Learning Resources (curated)

**Core Technologies**

*   **`onnxruntime-web`**: Official documentation for WebGPU inference.
*   **React/Next.js**: Official documentation.
*   **Rust and WebAssembly (rustwasm)**: The canonical book for `wasm-bindgen` and JS ↔ Rust interop patterns.

**WebGPU**

*   *WebGPU Fundamentals* or MDN WebGPU guide.

**Image Processing in Rust**

*   `image` crate documentation.

**PWA/Offline**

*   Workbox, MDN guides for CacheStorage/IndexedDB, and web app manifests.

---

## 21) Definition of Done (DoD)

*   All acceptance criteria met.
*   Automated CI build (Rust + UI), static analysis (clippy), and smoke tests pass.
*   Tested on latest Chrome (desktop & Android) and Safari (macOS & iOS).
*   Public demo page served statically; no server APIs required.
