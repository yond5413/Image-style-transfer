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

## 4. `useWebcam.ts`: Encapsulating Real-time Video Logic

Processing a real-time video stream is fundamentally different from processing a single image. To handle this complexity cleanly, all video-related logic is encapsulated in the `useWebcam.ts` hook.

### Design Rationale

Previously, the video processing loop and webcam state were managed directly within the `video/page.tsx` component using multiple `useEffect` hooks. This led to several problems:
-   **Complex State Management**: `isVideoRunning`, the `MediaStream` object, and the `requestAnimationFrame` ID were all managed separately.
-   **Resource Leaks**: It was difficult to ensure that the camera stream and the animation loop were always cleaned up correctly.
-   **Poor Separation of Concerns**: The main page component was cluttered with low-level video processing logic.

The `useWebcam` hook solves these problems by creating a single, self-contained unit for all video functionality.

### How It Works

The hook is instantiated in `video/page.tsx` like this:

```typescript
const {
  isVideoRunning,
  videoRef,
  startWebcam,
  stopWebcam,
} = useWebcam(model.runInferenceOnFrame, outputCanvasRef);
```

-   **Arguments**: It takes two arguments:
    1.  `runInference`: A callback function that will be executed on each video frame. In our case, we pass `model.runInferenceOnFrame` from the `useModelRunner` hook.
    2.  `outputCanvasRef`: A ref to the canvas where the final stylized video should be drawn.
-   **Return Values**: It returns an object containing:
    -   `isVideoRunning`: A boolean state variable indicating if the webcam is active.
    -   `videoRef`: A ref to be attached to the `<video>` element.
    -   `startWebcam`: A function to start the webcam.
    -   `stopWebcam`: A function to gracefully stop the webcam and clean up all resources.

### The Video Loop: `videoLoop`

The core of the hook is the `videoLoop` function, which is powered by `requestAnimationFrame`.

```typescript
const videoLoop = useCallback(async () => {
  if (videoRef.current && videoRef.current.readyState >= 3 && outputCanvasRef.current) {
    // 1. Draw current video frame to a temporary canvas
    // ...
    
    // 2. Run inference on the temporary canvas
    const outputImageData = await runInference(tempCanvas);
    
    // 3. Draw the stylized result to the output canvas
    if (outputImageData) {
      // ... drawing logic ...
    }
  }
  // 4. Schedule the next frame
  requestRef.current = requestAnimationFrame(videoLoop);
}, [runInference, outputCanvasRef]);
```

This loop continuously:
1.  Captures the current frame from the `<video>` element.
2.  Calls the `runInference` function that was passed in as an argument.
3.  Draws the resulting `ImageData` to the output canvas.
4.  Schedules itself to be called again on the next animation frame.

### Graceful Shutdown: `stopWebcam`

The `stopWebcam` function is critical for preventing resource leaks.

```typescript
const stopWebcam = useCallback(() => {
  // 1. Stop the animation loop
  if (requestRef.current) {
    cancelAnimationFrame(requestRef.current);
  }
  
  // 2. Update the state
  setIsVideoRunning(false);
  
  // 3. Stop the camera hardware track
  if (videoRef.current && videoRef.current.srcObject) {
    const stream = videoRef.current.srcObject as MediaStream;
    stream.getTracks().forEach(track => track.stop());
    videoRef.current.srcObject = null;
  }
}, []);
```
This function ensures that both the animation loop is cancelled and, most importantly, the browser is instructed to release the camera hardware (`track.stop()`). This turns off the camera light and frees up the device for other applications.

### Solving Stale Closures with `useRef`

A critical challenge in the `useWebcam` hook is ensuring the `videoLoop` always calls the *latest* version of the `runInference` function. When the user selects a new model, the `useModelRunner` hook creates a new `runInferenceOnFrame` function with the new model's session in its closure.

**The Problem:** The `videoLoop` is wrapped in a `useCallback` for performance. If we include `runInference` in its dependency array, the loop itself gets recreated frequently, which is not ideal. However, if we *don't* include it, the `videoLoop` holds a "stale" reference to the very first `runInference` function it received, and it never gets the new one when the model changes.

**The Solution:** We use a `useRef` to act as a stable "box" for the `runInference` function.

```typescript
// In useWebcam.ts

// ...
const runInferenceRef = useRef(runInference);

useEffect(() => {
  runInferenceRef.current = runInference;
}, [runInference]);

const videoLoop = useCallback(async () => {
  // ...
  const outputImageData = await runInferenceRef.current(tempCanvas);
  // ...
}, [outputCanvasRef, isModelLoading]); // Note: runInference is NOT in the dependency array
```

1.  **`runInferenceRef`**: A `ref` is created to hold the `runInference` function.
2.  **`useEffect`**: This effect runs whenever the `runInference` prop changes (i.e., when a new model is loaded). It updates the `.current` property of the ref to point to the latest function.
3.  **`videoLoop`**: The loop itself is now only created once (its dependencies rarely change). On every frame, it calls `runInferenceRef.current()`. This ensures it always executes the most up-to-date version of the inference function, correctly applying the newly selected model's style without needing to restart the webcam.

This pattern is a standard and highly effective way to handle callbacks that change over time within a long-running `useCallback` or `useEffect` hook.
