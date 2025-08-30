# Project Plan & Future Steps

This document outlines the work completed so far and the proposed next steps for the Image Style Transfer application.

## Completed Work

We have successfully addressed the most critical and high-priority feedback from the initial code review. The application is now more robust, feature-complete, and performant.

-   **Core UI Features:** Implemented the 'Style Strength' slider, a 'Download PNG' button, and a 'Reset' button.
-   **Improved UI/UX:** Replaced the default file input with a custom-styled button that displays the selected filename and improved the layout of the controls.
-   **Image Processing Fix:** Corrected a critical bug in the Rust/WASM code by adding the missing normalization step to the image preprocessing, which significantly improved the quality of the style transfer.
-   **Performance Enhancements:** Implemented a two-level caching strategy:
    -   In-memory caching for `InferenceSession` objects to avoid re-creating them.
    -   Browser `CacheStorage` for the ONNX model files to avoid re-downloading them on subsequent visits.
-   **Offline Support:** Added a service worker to enable offline use of the application.

## Next Steps

The following are the proposed next steps to continue improving the application.

### 1. Code Refactoring (High Priority)

The main `src/app/page.tsx` component is currently managing too many responsibilities. To improve maintainability and prepare for new features, we will refactor the code:

-   **Create Custom Hooks:**
    -   `useModelRunner`: To encapsulate all logic related to model loading, inference, and post-processing.
    -   `useImageUploader`: To handle the image upload and management logic.
-   **Create Presentational Components:**
    -   `ControlPanel`: A dedicated component for all UI controls.
    -   `CanvasDisplay`: A component for rendering the canvases.
-   **Simplify `page.tsx`:** The main page will be simplified to primarily handle layout and data flow between the hooks and components.

### 2. Webcam Support (High Priority)

Implement real-time style transfer from a webcam feed.

-   Add UI controls to start and stop the webcam.
-   Use `navigator.mediaDevices.getUserMedia` to access the webcam stream.
-   Use `requestAnimationFrame` to create a rendering loop for real-time inference and display.

### 3. Full Inference Pipeline in Rust/WASM (Future Consideration)

Currently, the inference process is orchestrated in TypeScript, with image pre/post-processing happening in Rust/WASM. For maximum performance, we could move the entire inference pipeline into the WASM module.

-   **Current Architecture:**
    -   **TypeScript:** Loads model, creates `InferenceSession`, prepares tensors.
    -   **Rust/WASM:** `preprocess` (image to tensor), `postprocess` (tensor to image).
-   **Proposed Future Architecture:**
    -   **TypeScript:** Manages UI and user input.
    -   **Rust/WASM:** A single `run_style_transfer` function that takes the image bytes and style strength, and handles everything internally:
        -   Model loading and session management (potentially using a Rust ONNX runtime).
        -   Preprocessing.
        -   Inference.
        -   Post-processing.
        -   Returns the final stylized image bytes.

This would minimize the data transfer between the JavaScript and WASM environments, potentially leading to a significant performance boost, especially for real-time webcam processing. This is a considerable architectural change and should be evaluated after the current refactoring and feature set are complete.

### 4. Medium & Low Priority Items

Address the remaining medium and low-priority items from the code review, including:
-   Adding automated tests.
-   Improving accessibility.
-   Adding user-facing documentation/help.
