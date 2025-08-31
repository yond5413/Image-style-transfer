# TypeScript Deep Dive (Enhanced)

This document provides a highly detailed walkthrough of the TypeScript and React codebase. It is intended for new developers to get up to speed with the frontend architecture, data flow, and design patterns.

## 1. Data Flow and State Management

The application follows a unidirectional data flow pattern.

```
[Hooks] -> [Page Component] -> [Presentational Components]
```

1.  **Hooks (`useImageUploader`, `useModelRunner`)**: Contain all the business logic, state variables, and state-mutating functions. They are completely independent of the UI.
2.  **Page Component (`/image/page.tsx`)**: Acts as a "Composition Root". It calls the hooks, receives state and functions from them, and passes them down as props to the UI components. It does not contain any business logic itself.
3.  **Presentational Components (`ImageControlPanel`, `CanvasDisplay`)**: These are "dumb" components. They only receive props and render UI. They call functions passed down in props to signal user interactions.

This separation of concerns makes the code highly modular and easy to test and refactor.

---

## 2. `useImageUploader.ts`: Managing the Input Image

This hook encapsulates all logic related to the user's uploaded image.

### State Variables

```typescript
const [originalImageBytes, setOriginalImageBytes] = useState<ArrayBuffer | null>(null);
const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
const [fileName, setFileName] = useState<string | null>(null);
const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
```

-   `originalImageBytes`: The raw `ArrayBuffer` of the image. This is the "source of truth" that is sent to the backend for processing.
-   `originalImageUrl`: A temporary URL created by the browser (`blob:...`). This is a performance optimization to avoid converting the `ArrayBuffer` to a displayable format in JS.
-   `fileName`: The name of the user's file, for display purposes.
-   `originalCanvasRef`: A React `ref` to the `<canvas>` element. We use a ref to gain direct access to the canvas API for drawing.

### Core Logic: `handleImageUpload`

This function is a great example of asynchronous browser APIs working together.

```typescript
const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setFileName(file.name);

  // 1. Read the file as an ArrayBuffer
  const reader = new FileReader();
  reader.onload = (e) => {
    const arrayBuffer = e.target?.result as ArrayBuffer;
    if (!arrayBuffer) return;

    // 2. Create a display URL and draw to canvas
    const imageUrl = URL.createObjectURL(file);
    setOriginalImageBytes(arrayBuffer);
    setOriginalImageUrl(imageUrl);

    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      // ... drawing logic ...
    };
  };
  reader.readAsArrayBuffer(file);
};
```

1.  **`FileReader`**: This is the standard browser API for reading files. We use `readAsArrayBuffer` because that's the format our WASM module expects. The result is delivered asynchronously via the `onload` callback.
2.  **`URL.createObjectURL`**: This is a highly efficient way to create a temporary, in-memory URL that refers to the `File` object. It's much faster than, for example, creating a base64 data URL. The browser handles the memory management for this URL.

---

## 3. `useModelRunner.ts`: The Inference Engine

This is the most complex part of the frontend. It manages the ML session, the WASM module, and the inference pipeline.

### Initialization and WASM Loading

```typescript
useEffect(() => {
  // ... WebGPU detection ...

  async function loadWasmAndModels() {
    try {
      // Dynamically import the WASM package
      const wasm = await import("../wasm/pkg");
      await wasm.default(); // Initialize the wasm module
      wasmRef.current = wasm;

      // ... fetch manifest ...
    } catch (e) {
      // ... error handling ...
    }
  }
  loadWasmAndModels();
}, []);
```

-   **Dynamic `import()`**: The `import("../wasm/pkg")` call is crucial. It tells the bundler (Next.js/Webpack) to split the WASM code into a separate chunk. This chunk is loaded asynchronously, so it doesn't block the initial rendering of the page.
-   `wasm.default()`: The `wasm-pack` build process generates a default export that is an async function. This function must be called to initialize the WebAssembly module and its memory.

### The Inference Pipeline: `runInferenceOnImage`

This function is the core data processing pipeline. Here is a line-by-line breakdown:

```typescript
const runInferenceOnImage = useCallback(async (imageBytes: ArrayBuffer) => {
  // 1. Ensure the model session is ready
  const currentSession = await createSession(selectedModelId);
  if (!currentSession) return;

  // 2. Pre-process the image in WebAssembly
  setStatus("Preprocessing...");
  const tensor = wasmRef.current.preprocess(new Uint8Array(imageBytes), modelWidth, modelHeight);

  // 3. Run the model on the GPU
  setStatus("Running inference...");
  const inputName = currentSession.inputNames[0];
  const feeds = { [inputName]: new Tensor('float32', tensor, modelShape) };
  const results = await currentSession.run(feeds);
  const newOutputTensor = results[currentSession.outputNames[0]];

  // 4. Post-process the result in WebAssembly
  setStatus("Postprocessing...");
  const pixelData = wasmRef.current.postprocess(newOutputTensor.data, new Uint8Array(imageBytes), modelWidth, modelHeight, styleStrength);

  // 5. Render the final image to the canvas
  setStatus("Done!");
  // ... canvas drawing logic ...
}, [/* dependencies */]);
```

1.  **Get Session**: It calls `createSession` which either retrieves a cached session or creates and warms up a new one. This is `await`ed to ensure we don't proceed without a valid session.
2.  **Pre-process (JS -> WASM)**: The `imageBytes` (`ArrayBuffer`) is wrapped in a `Uint8Array` view (this is a zero-copy operation) and passed to the `preprocess` function in our Rust/WASM module. The return value is a `Float32Array` tensor, ready for the model.
3.  **Inference (GPU)**: A `feeds` object is created to map the input name of the model to our tensor. `session.run()` uploads the tensor to the GPU, executes the model, and returns the result tensor. This is the most computationally expensive step.
4.  **Post-process (WASM -> JS)**: The output tensor data (`newOutputTensor.data`) is passed *back* to our WASM module, along with the original image (for blending) and the style strength. The WASM module returns the final `Uint8ClampedArray` of pixel data.
5.  **Render**: The `pixelData` is used to create an `ImageData` object, which is then efficiently drawn to the output canvas.

### Error Handling

Currently, errors within the pipeline are caught by a `try...catch` block and logged to the console.

```typescript
try {
  // ... inference pipeline ...
} catch (e: unknown) {
  if (e instanceof Error) {
    console.error(e.message);
    setStatus(`Error: ${e.message}`);
  } // ...
}
```

**Future Improvement**: A more robust solution would involve a dedicated error state (e.g., `const [error, setError] = useState<string | null>(null);`) and displaying a user-friendly toast notification or message in the UI when an error occurs.

---

## 4. Real-time Video vs. Single Image Processing

While the core style transfer logic is similar, processing a real-time video stream has unique constraints and a different implementation path compared to processing a single static image.

### The Video Loop: `requestAnimationFrame`

For video, we don't have a single `ArrayBuffer` to process. Instead, we have a continuous stream of frames from the webcam. The processing of this stream is handled by a rendering loop created with `requestAnimationFrame`.

```typescript
const videoLoop = async () => {
  if (isVideoRunning) {
    // ... drawing and inference logic ...
    requestAnimationFrame(videoLoop);
  }
};
```

-   **Why `requestAnimationFrame`?** This is the browser's native and most efficient way to run animations or rendering loops. It tells the browser that you wish to perform an animation and requests that the browser call a specified function to update an animation before the next repaint. This has several advantages over a `setInterval` loop:
    -   **Efficiency**: The browser can optimize performance and battery life by grouping animations together.
    -   **Backpressure**: If the browser tab is in the background, the loop will be paused, saving system resources.
    -   **Smoothness**: It's synchronized with the browser's repaint cycle, leading to smoother animations.

### The Video Inference Pipeline: `runInferenceOnFrame`

Inside the `videoLoop`, the `runInferenceOnFrame` function is called. It differs from `runInferenceOnImage` in several key ways:

```typescript
const runInferenceOnFrame = useCallback(async (canvas: HTMLCanvasElement) => {
  // 1. Get pixel data from the canvas
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const framePixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // 2. Pre-process the frame in WebAssembly
  const tensor = wasmRef.current.preprocess_frame(new Uint8Array(framePixelData), ...);

  // 3. Run the model
  // ... (similar to runInferenceOnImage) ...

  // 4. Post-process the frame in WebAssembly
  const pixelData = wasmRef.current.postprocess_frame(newOutputTensor.data, ...);

  // 5. Return the final ImageData
  return new ImageData(new Uint8ClampedArray(pixelData), modelWidth, modelHeight);
}, [/* dependencies */]);
```

1.  **Input Source**: The input is not an `ArrayBuffer` of a file. Instead, it's the raw pixel data (`Uint8Array`) obtained by calling `ctx.getImageData()` on a canvas that is displaying the current video frame.
2.  **Dedicated WASM Functions**: It calls `preprocess_frame` and `postprocess_frame` in the Rust/WASM module. These functions are optimized for working with raw pixel data directly, bypassing the need for image decoding.
3.  **Return Value**: It returns the final `ImageData` object directly, which is then drawn to the output canvas by the `videoLoop`.

### Performance Considerations for Real-time Video

-   **Frame Rate vs. Processing Time**: The goal is to have the entire `runInferenceOnFrame` pipeline execute faster than the time between frames (e.g., < 33ms for 30 FPS).
-   **Frame Skipping**: If the processing of a frame takes too long, the `requestAnimationFrame` loop will naturally "skip" the next frame. For example, if one frame takes 50ms to process, we miss the 33ms target, and the next frame will be processed when the system is ready. This prevents a backlog of frames from building up and crashing the application.
-   **Resolution is Key**: The most significant factor for achieving real-time performance is the resolution of the video stream being processed. The webcam feed is often processed at a much lower resolution (e.g., 256x256 or 384x384) than a static image to ensure the pipeline can run fast enough.
