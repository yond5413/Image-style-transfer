# TypeScript Deep Dive

This document provides a detailed walkthrough of the TypeScript and React code, explaining the role of each component, hook, and the data flow between them.

## 1. Composition Root: `src/app/image/page.tsx`

This component is the entry point and the "composition root" of the application. It is responsible for:

1.  **Instantiating Hooks**: It calls `useImageUploader()` and `useModelRunner()` to create instances of our core logic controllers.
2.  **State Management**: It holds the application state returned from the hooks and passes it down to the presentational components as props.
3.  **Layout**: It arranges the `ImageControlPanel` and `CanvasDisplay` components on the page.

By keeping the main page component focused on composition, we make the overall architecture cleaner and easier to refactor.

## 2. `useImageUploader.ts`: Managing the Input Image

This hook encapsulates all logic related to the user's uploaded image.

### State Variables

-   `originalImageBytes: ArrayBuffer | null`: Stores the raw binary data of the user's image. This is passed to the WASM module for processing.
-   `originalImageUrl: string | null`: A URL created via `URL.createObjectURL()`. This is used to efficiently display the uploaded image without needing to convert the `ArrayBuffer` back to an image format in JavaScript.
-   `fileName: string | null`: The name of the uploaded file, displayed in the UI.
-   `originalCanvasRef: RefObject<HTMLCanvasElement>`: A ref to the canvas element that displays the original image.

### Core Logic: `handleImageUpload`

This function is triggered by the `<input type="file">` element. Here is its step-by-step execution:

1.  **Get File**: It retrieves the `File` object from the input event.
2.  **Read as ArrayBuffer**: It uses a `FileReader` to read the file as an `ArrayBuffer`. The result is stored in `originalImageBytes`.
3.  **Create Object URL**: Simultaneously, `URL.createObjectURL()` is called on the `File` object to create a temporary, in-memory URL. This is stored in `originalImageUrl`.
4.  **Draw to Canvas**: An `Image` element is created in memory with the object URL as its source. In the `onload` callback, the image is drawn to the `originalCanvasRef`. During this step, the image is scaled down if it exceeds `MAX_CANVAS_SIZE` to maintain UI performance.

## 3. `useModelRunner.ts`: The Inference Engine

This is the heart of the application, orchestrating the ML model, the WASM module, and the user's selections.

### State Variables

-   `session: InferenceSession | null`: The active ONNX Runtime inference session.
-   `sessionCache: Record<string, InferenceSession>`: An in-memory cache (a simple object) to store previously created sessions.
-   `status: string`: A user-facing status message (e.g., "Loading model...", "Running inference...").
-   `models: ModelManifestEntry[]`: An array of available models, loaded from `public/models/manifest.json`.
-   `selectedModelId: string | null`: The ID of the currently selected style.
-   `styleStrength: number`: The current value of the blending slider (0.0 to 1.0).
-   `outputCanvasRef: RefObject<HTMLCanvasElement>`: A ref to the canvas that displays the stylized image.
-   `wasmRef: RefObject<any>`: A ref to hold the loaded WebAssembly module.

### Initialization: `useEffect`

On the initial component mount, a `useEffect` hook performs the following setup:

1.  **Detects WebGPU**: It checks for `navigator.gpu` to determine if WebGPU is available.
2.  **Loads WASM**: It dynamically imports the WASM package from `/src/wasm/pkg`.
3.  **Fetches Manifest**: It fetches `/models/manifest.json` to populate the list of available styles.

### Core Logic: `createSession` and `runInferenceOnImage`

**`createSession(modelId)`**

1.  **Check Cache**: It first checks if a session for the given `modelId` already exists in `sessionCache`. If so, it returns the cached session immediately.
2.  **Create Session**: If not cached, it calls `InferenceSession.create()`, passing the model's `.onnx` file path and the chosen execution provider (`webgpu` or `webgl`).
3.  **Warm-up**: After creating the session, it performs a single "warm-up" run with a dummy tensor of zeros. **This is a critical performance optimization.** It forces the GPU to compile the necessary shaders for the model *before* the user runs their first real inference, preventing a long delay on the first stylization.
4.  **Update Cache**: The newly created session is stored in `sessionCache`.

**`runInferenceOnImage(imageBytes)`**

This function is the main pipeline, executed in a clear sequence:

1.  `await createSession(selectedModelId)`: Ensures the correct model is loaded and ready.
2.  `wasmRef.current.preprocess(...)`: Calls the Rust/WASM function, passing the image data. The result is a `Float32Array` tensor.
3.  `session.run(...)`: Executes the ONNX model on the GPU, feeding it the tensor from the previous step.
4.  `wasmRef.current.postprocess(...)`: Calls the Rust/WASM function with the model's output tensor and the original image data for blending.
5.  `outputCtx.drawImage(...)`: The final `ImageData` is drawn to the output canvas. It uses an intermediate temporary canvas to correctly handle resizing the model's output to match the original image's aspect ratio, preventing distortion.
