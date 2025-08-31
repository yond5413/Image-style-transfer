# Rust & WebAssembly Deep Dive

This document provides a detailed walkthrough of the Rust code, explaining the dependencies, the interface with JavaScript, and the core image processing logic.

## 1. Dependencies: `Cargo.toml`

The Rust module relies on several key crates to function:

-   **`wasm-bindgen`**: The core crate that facilitates the interaction between Rust and JavaScript. It allows us to export Rust functions to JS and import JS functions into Rust.
-   **`js-sys`** and **`web-sys`**: Provide raw bindings to JavaScript's standard library and Web APIs, respectively. We use them for interacting with browser features like `console.log` and for using JS types like `Float32Array`.
-   **`image`**: A powerful image processing library. We use it for decoding various image formats (PNG, JPEG), resizing, and manipulating pixel data.
-   **`console_error_panic_hook`**: A utility that makes debugging easier. When a panic occurs in the Rust code, this hook logs the detailed panic message and stack trace to the browser's developer console.

## 2. The JS-Rust Interface: `lib.rs`

This file is the entry point for our WebAssembly module. Its primary role is to define the public API that will be exposed to our JavaScript frontend.

-   **`#[wasm_bindgen]`**: This attribute is the key. Any function decorated with `#[wasm_bindgen]` is made accessible to JavaScript.
-   **API Design**: The functions are designed to be "chunky," meaning they perform a significant amount of work in a single call. This is a deliberate performance choice to minimize the overhead of crossing the JS-WASM boundary.

## 3. The Processing Kernel: `image_ops.rs`

This file contains the high-performance image manipulation logic. These functions are where the heavy lifting happens.

### `preprocess(image_bytes: &[u8], width: u32, height: u32)`

This function prepares the user's image to be fed into the ONNX model.

**Step-by-step Execution:**

1.  **Decode**: `image::load_from_memory(image_bytes)` is used to decode the raw `Uint8Array` from JavaScript into a `DynamicImage`, which can handle various image formats.
2.  **Resize**: The image is resized to the exact dimensions required by the model (`width`, `height`). It uses the `Lanczos3` resampling filter, which provides high-quality results, preventing aliasing and preserving detail.
3.  **Convert to RGB**: The image is converted to the `RGB8` format, as most style transfer models expect a 3-channel input.
4.  **Normalize and Create Tensor**: The code iterates through each pixel of the resized image. For each pixel, the R, G, and B values (which are integers from 0-255) are converted to `f32` and normalized to the range `[0.0, 1.0]` by dividing by 255.0.
5.  **NCHW Format**: The normalized values are pushed into a `Vec<f32>` in the NCHW (Batch, Channel, Height, Width) order that the ONNX model expects. The final `Vec<f32>` is then converted to a `js_sys::Float32Array` to be returned to JavaScript.

### `postprocess(...)`

This function takes the model's output tensor and blends it with the original image.

**Step-by-step Execution:**

1.  **Decode Original**: The original image bytes are decoded again to be used for blending.
2.  **Resize Output**: The model's output (which is a tensor) is first converted into an `RgbImage`. This stylized image is then resized to match the dimensions of the *original* user image, ensuring the final downloadable image has the same resolution as the input.
3.  **Blend**: The code iterates through the pixels of the resized stylized image and the original image simultaneously. It applies a linear interpolation formula for each color channel (R, G, B):
    ```
    final_pixel = (stylized_pixel * strength) + (original_pixel * (1.0 - strength))
    ```
    This allows the user to control the intensity of the style transfer effect.
4.  **Create Final Image Data**: The blended pixel values are collected into a `Vec<u8>` in RGBA format. This is then converted to a `js_sys::Uint8ClampedArray` and returned to JavaScript, where it can be directly rendered to a canvas using `putImageData()`.
