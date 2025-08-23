use image::{imageops::FilterType};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ImageError {
    #[error("Failed to decode image")]
    Decode(#[from] image::ImageError),
}

/// Preprocesses an image for the style transfer model.
///
/// This function performs several crucial steps:
/// 1. Decodes the image from its raw byte format (e.g., PNG, JPEG).
/// 2. Resizes the image to the specific dimensions required by the ONNX model.
/// 3. Converts the pixel data into a `Vec<f32>` tensor.
/// 4. Normalizes the pixel values to the [0.0, 1.0] range.
/// 5. Arranges the tensor data into NCHW format (Batch, Channels, Height, Width),
///    which is the standard input format for many computer vision models.
///
/// # Arguments
/// * `image_bytes`: Raw bytes of the input image.
/// * `target_width`: The width the image should be resized to.
/// * `target_height`: The height the image should be resized to.
///
/// # Returns
/// A `Result` containing the preprocessed image data as a `Vec<f32>` on success,
/// or an `ImageError` on failure.
pub fn preprocess_image(
    image_bytes: &[u8],
    target_width: u32,
    target_height: u32,
) -> Result<Vec<f32>, ImageError> {
    // 1. Decode the image from raw bytes. `load_from_memory` automatically
    //    detects the format (PNG, JPEG, etc.).
    let img = image::load_from_memory(image_bytes)?;

    // 2. Resize the image to the model's required input dimensions.
    //    We use the `Triangle` filter, which provides a good balance of
    //    quality and performance for downscaling.
    let resized_img = img.resize_exact(target_width, target_height, FilterType::Triangle);

    // 3. Convert the resized image to RGB format. Models typically work with
    //    RGB data and don't need the alpha channel.
    let rgb_img = resized_img.to_rgb8();

    // 4. Create separate vectors for each color channel (R, G, B) for clarity.
    let mut r_channel = Vec::with_capacity((target_width * target_height) as usize);
    let mut g_channel = Vec::with_capacity((target_width * target_height) as usize);
    let mut b_channel = Vec::with_capacity((target_width * target_height) as usize);

    // 5. Iterate over the pixels and populate the channel vectors.
    //    Normalize pixel values from [0, 255] to [0.0, 1.0].
    for pixel in rgb_img.pixels() {
        r_channel.push(pixel[0] as f32 / 255.0);
        g_channel.push(pixel[1] as f32 / 255.0);
        b_channel.push(pixel[2] as f32 / 255.0);
    }

    // 6. Combine the channels into the final tensor in NCHW format.
    //    This is done by appending the entire G channel after the R, and then the B after the G.
    let mut tensor = Vec::with_capacity((3 * target_width * target_height) as usize);
    tensor.extend_from_slice(&r_channel);
    tensor.extend_from_slice(&g_channel);
    tensor.extend_from_slice(&b_channel);

    Ok(tensor)
}
