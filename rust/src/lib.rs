pub mod image_ops;

use wasm_bindgen::prelude::*;
use image_ops::{preprocess_image, postprocess_image};
use js_sys::{Float32Array, Uint8Array};

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub fn preprocess(image_bytes: &[u8], target_width: u32, target_height: u32) -> Result<Float32Array, JsValue> {
    console_error_panic_hook::set_once();
    let tensor = preprocess_image(image_bytes, target_width, target_height).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(Float32Array::from(tensor.as_slice()))
}

#[wasm_bindgen]
pub fn postprocess(output_tensor: Float32Array, original_image_bytes: &[u8], width: u32, height: u32, strength: f32) -> Result<Uint8Array, JsValue> {
    console_error_panic_hook::set_once();
    let output_vec = output_tensor.to_vec();
    let result_rgba = postprocess_image(output_vec, original_image_bytes, width, height, strength).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(Uint8Array::from(result_rgba.as_slice()))
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}
