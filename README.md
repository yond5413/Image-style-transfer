# Privacy-First, In-Browser Image Style Transfer

This web application allows you to apply artistic styles to your images directly in your browser. All processing happens on your device, ensuring your images remain private. The app leverages the power of WebAssembly (WASM) and WebGPU for high-performance image processing.

## Features

-   **Client-Side Processing:** All image processing is done in the browser. No data is ever sent to a server.
-   **Multiple Styles:** Choose from a variety of pre-trained style transfer models.
-   **Adjustable Style Strength:** Control the blend between the original and stylized image.
-   **Download Your Creation:** Save your stylized image as a PNG file.
-   **Offline Support:** Use the app even without an internet connection (after the initial visit).
-   **WebGPU Accelerated:** Utilizes the WebGPU API for fast inference, falling back to WebGL/WASM if necessary.

## System Architecture

The application is composed of three main parts:

1.  **React Frontend (TypeScript):** The user interface is built with React and TypeScript. It handles user interactions, state management, and orchestrates the image processing pipeline.
2.  **Image Processing (Rust/WASM):** The core image processing logic is written in Rust and compiled to WebAssembly. This includes pre-processing the input image and post-processing the model's output.
3.  **ONNX Runtime Web:** This library runs the pre-trained style transfer models (in ONNX format) using WebGPU for hardware acceleration.

### Data Flow

1.  The user selects an image from their computer.
2.  The React application sends the image data to the WASM module for pre-processing.
3.  The Rust code resizes and normalizes the image, returning a tensor.
4.  The tensor is fed into the ONNX Runtime Web, which runs the style transfer model on the GPU.
5.  The output tensor from the model is sent back to the WASM module for post-processing.
6.  The Rust code blends the stylized output with the original image based on the user-defined style strength.
7.  The final image data is rendered on a canvas in the browser.

## Component Breakdown

### Frontend (TypeScript/React)

-   **`src/app/image/page.tsx`**: The main page component that ties everything together.
-   **`src/components/ImageControlPanel.tsx`**: The UI panel containing all the controls (image upload, style selection, strength slider, download, and reset buttons).
-   **`src/components/CanvasDisplay.tsx`**: The component responsible for rendering the original and stylized images on canvases.
-   **`src/hooks/useImageUploader.ts`**: A custom hook that manages the state and logic for uploading and resetting the image.
-   **`src/hooks/useModelRunner.ts`**: A custom hook that handles loading the ONNX models, running the inference, and managing the WebAssembly module.

### Backend (Rust/WASM)

-   **`rust/src/lib.rs`**: The main Rust library file that defines the functions exposed to the JavaScript environment via `wasm-bindgen`.
-   **`rust/src/image_ops.rs`**: This file contains the core image processing logic:
    -   `preprocess`: Takes the input image, resizes it to the model's expected dimensions, and normalizes the pixel values.
    -   `postprocess`: Takes the output tensor from the model and the original image, and blends them together based on the style strength.

## How to Run Locally

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Build the WASM module:**
    ```bash
    (cd rust && wasm-pack build --target web)
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```

## How to Run Tests

To run the Rust tests, use the following command from the project root:
```bash
cargo test --manifest-path rust/Cargo.toml
```

There are currently no frontend tests configured for this project.

## Technology Stack

-   **Frontend:** React, Next.js, TypeScript, Tailwind CSS
-   **Backend:** Rust, WebAssembly
-   **Machine Learning:** ONNX Runtime Web, WebGPU
