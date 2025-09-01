# Architecture Deep Dive

This document provides a senior-level overview of the application's architecture. It explains the design decisions, trade-offs, and potential areas for future optimization.

## 1. High-Level Philosophy

The core philosophy is **privacy and performance through client-side execution**.

-   **Privacy-First**: No user images are ever uploaded to a server. All computation happens within the browser sandbox.
-   **Performance**: We leverage modern web technologies (WebAssembly, WebGPU) to execute machine learning models at near-native speed.
-   **Accessibility**: The application is designed to be a Progressive Web App (PWA), enabling offline use and a native-like feel.

The main architectural trade-off is a larger initial download size (for the WASM module and ML models) in exchange for zero server costs and enhanced user privacy.

## 2. System Components

The application consists of three primary components that interact within the browser:

1.  **UI Layer (React/TypeScript)**: The user-facing interface, built with Next.js and React. It is responsible for user interaction, state management, and orchestrating the other components.
2.  **Inference Engine (ONNX Runtime Web)**: This layer loads and executes the pre-trained style transfer models (`.onnx` files). It uses the **WebGPU** execution provider for GPU acceleration, with a fallback to **WebGL** if WebGPU is unavailable.
3.  **Image Processing Kernel (Rust/WebAssembly)**: A highly optimized library for CPU-intensive image manipulation tasks. It handles the pre-processing of input images and the post-processing of the model's output.

---

## 3. Frontend Architecture (`/src`)

The frontend is designed for maintainability and separation of concerns, using a pattern of custom hooks for logic and presentational components for the UI.

### `useModelRunner.ts`: The Inference Orchestrator

This is the most critical hook in the system. It acts as the central coordinator, managing the ML model, the WASM module, and the overall inference process.

**Key Responsibilities & Design Rationale:**

-   **Dynamic WASM Loading**: The Rust/WASM module is loaded dynamically using `import()`.
    -   **Why?** This prevents the ~1MB WASM binary from blocking the main thread during initial page load, improving the Time to Interactive (TTI).
-   **Execution Provider Selection**: It detects WebGPU support and configures ONNX Runtime accordingly. It also includes robust fallback logic to WebGL/WASM if the preferred provider is not available or fails to initialize.
    -   **Why?** WebGPU is significantly faster for this type of computation. Providing a WebGL fallback broadens device compatibility. The explicit fallback mechanism ensures a smoother user experience even on devices with partial or inconsistent WebGPU support.

-   **Two-Level Model Caching**:
    1.  **In-Memory Session Cache (`sessionCache`)**: `InferenceSession` objects are stored in a simple JavaScript object.
        -   **Why?** Re-creating an inference session is expensive as it involves compiling the model shaders. Caching the session object in memory makes switching between recently used styles nearly instantaneous.
    2.  **Browser `CacheStorage`**: ONNX Runtime Web automatically uses the browser's native `CacheStorage` API to store the `.onnx` model files.
        -   **Why?** This enables offline use and avoids re-downloading model files on subsequent visits, saving bandwidth and improving load times.

-   **Inference Orchestration (`runInferenceOnImage`)**: This function sequences the entire style transfer process.
    -   **Design**: It's an `async` function that calls out to the WASM module for pre/post-processing and to ONNX Runtime for inference. This clear, sequential flow makes the process easy to debug and reason about.

**Potential Optimizations:**

-   **Web Workers**: The entire `useModelRunner` logic could be moved into a Web Worker. This would completely offload model loading and inference from the main thread, ensuring the UI remains responsive even during heavy computation.
-   **Model Quantization**: The `.onnx` models are currently FP32. Converting them to FP16 or INT8 (if supported by the execution provider) would significantly reduce model size and could improve inference speed on some hardware.

### `useImageUploader.ts`: Image Handling

This hook manages the user's input image.

-   **Design Rationale**: It encapsulates all logic related to file reading, URL creation, and drawing the initial image to a canvas. This keeps the main page component clean and focused on layout.
-   **Performance Consideration**: It resizes large images before drawing them to the canvas (`MAX_CANVAS_SIZE`).
    -   **Why?** This prevents very large images from consuming excessive memory and slowing down the initial processing steps. The resizing is done on the display canvas, not the underlying data that gets sent to the model.

### `useWebcam.ts`: Real-time Video Handling

This hook encapsulates the complex logic of managing the webcam stream and the real-time processing loop.

-   **Design Rationale**: Previously, the video logic was handled inside the main `video/page.tsx` component, leading to complex `useEffect` hooks and difficult state management. By extracting this into a dedicated hook, we achieve:
    -   **Separation of Concerns**: The `video/page.tsx` component is now only responsible for layout and passing props.
    -   **Improved State Management**: The `isVideoRunning` state and the `requestAnimationFrame` loop are managed within the hook, preventing unnecessary re-renders of the main component.
    -   **Resource Management**: The `stopWebcam` function provides a single, reliable place to handle the cleanup of all video-related resources (media stream, animation frame), preventing resource leaks.

---

## 5. Offline Support & Caching (Service Worker)

The application is designed as a Progressive Web App (PWA) with robust offline capabilities, managed by a Service Worker (`public/sw.js`).

-   **Installation & Precaching**: On the first visit, the Service Worker is installed and precaches essential application shell files (HTML, CSS, core JavaScript). This ensures that the basic UI is available instantly on subsequent visits, even offline.
-   **Runtime Caching - ONNX Models**: ONNX model files (`.onnx`) are cached using a `Cache-First` strategy. Once a model is downloaded, it's stored in a dedicated cache (`onnx-models`) and served directly from there on subsequent requests, significantly speeding up model loading and enabling offline inference.
-   **Runtime Caching - Other Assets**: For other dynamic assets (e.g., Next.js generated JavaScript bundles, WASM binaries, images), a `Network-First` strategy is employed. This attempts to fetch from the network first to ensure up-to-date content, falling back to the cache if the network is unavailable. This balances freshness with offline availability.
-   **Cache Management**: The Service Worker includes an `activate` event listener to clean up old caches, ensuring that only the latest version of the application's assets are stored, preventing stale content and managing storage efficiently.

This comprehensive caching strategy contributes to a fast, reliable, and offline-capable user experience.

---

## 6. Backend Architecture (`/rust`)

The Rust code is compiled to WebAssembly and serves as a high-performance "kernel" for image processing tasks that are inefficient to perform in JavaScript.

### `lib.rs`: The JS-Rust Interface

-   **Design**: This file uses `wasm-bindgen` to define a clean, typed API between JavaScript and Rust.
-   **API Philosophy**: The functions (`preprocess`, `postprocess`) are designed to be "chunky" rather than "chatty".
    -   **Why?** Each call across the JS/WASM boundary has a small amount of overhead. By transferring a large amount of data in a single call and performing all heavy computation in Rust, we minimize this overhead.

### `image_ops.rs`: The Processing Kernel

This is where the performance-critical image manipulation happens.

-   **`preprocess`**:
    -   **Pipeline**: `decode -> resize -> normalize -> convert to NCHW tensor format`
    -   **Why Rust?** These operations, especially resizing and iterating over millions of pixels, are significantly faster in compiled Rust than in interpreted JavaScript. Performing this in WASM prevents the main thread from freezing.
-   - **`postprocess`**:
    -   **Pipeline**: `tensor to image -> blend with original -> convert to RGBA`
    -   **Why Rust?** Similar to preprocessing, the pixel-wise blending operation is much faster in Rust.

**Potential Optimizations:**

-   **SIMD (Single Instruction, Multiple Data)**: The pixel manipulation loops in `preprocess` and `postprocess` are prime candidates for SIMD optimization. By using Rust's `packed_simd` or `std::simd` (when stable), we could process multiple pixels at once, potentially doubling or quadrupling the speed of these functions.
-   **Full Pipeline in Rust**: The most significant optimization would be to move the ONNX runtime itself into the Rust code (using a crate like `tract` or `ort-rust`).
    -   **Pros**: This would eliminate the need to copy the tensor data back and forth between the JS and WASM contexts, reducing overhead.
    -   **Cons**: This would dramatically increase the complexity of the Rust code and the size of the final WASM binary. It would also make it harder to leverage the browser's built-in WebGPU support via `onnxruntime-web`. This is a major architectural change that should be carefully benchmarked.
-   **Multithreading**: For the `postprocess` blending, the image could be split into chunks and processed in parallel using WebAssembly threads. This would require careful setup of shared memory and would only be beneficial on devices with multiple cores.
