Actively Supported (Best starting points)

ONNX Runtime Web (onnxruntime-web)

Official & actively maintained.

Supports WebGPU, WASM, and WebGL.

Best operator coverage.

Example:

import * as ort from 'onnxruntime-web/webgpu';

const session = await ort.InferenceSession.create('./model.onnx', {
  executionProviders: ['webgpu']
});
const results = await session.run({ input: tensor });


📦 npm: onnxruntime-web

⚙️ Rust-first Options (more experimental)

tract (Rust ONNX inference engine)

Pure Rust, no external deps.

WASM-friendly, but CPU only (no WebGPU).

Great for lightweight / offline CPU inference.

📦 crates.io/tract

burn (Rust deep learning framework)

Modern Rust ML framework.

Has WebGPU backend (via wgpu).

ONNX import not 100% yet, but fast-moving.

📦 burn.dev

🧪 Experimental / Legacy

wonnx (Rust + WebGPU)

Direct ONNX → WebGPU inference in Rust.

Nice concept, but stale (last updated 2023).

Limited ONNX op coverage.

📦 github.com/webonnx/wonnx

Kyanite

Rust ML inference with CUDA/CPU.

Browser/WASM possible, but no WebGPU yet.

Good for desktop/server, not ready for VibeCoding yet.

🔮 Future Watchlist

Candle + WebGPU (Rust ML framework, HuggingFace-backed — may get ONNX/WebGPU in future).

WebNN API (experimental browser API, could eventually replace WASM/WebGPU for ML inference).

Suggested Test Plan for VibeCoding

Start with onnxruntime-web (production-ready, proven WebGPU support).

Benchmark with tract for CPU-only offline fallback.

Keep an eye on burn + candle for future Rust-native WebGPU inference.

Only use wonnx if you want to prototype pure Rust/WebGPU today (expect limited op coverage).

Do you want me to also pick a set of tiny style-transfer ONNX models (e.g., “mosaic”, “udnie”, “van_gogh”) that run fast and are known to work with ORT WebGPU? That way you’d have a plug-and-play model registry to test right away.