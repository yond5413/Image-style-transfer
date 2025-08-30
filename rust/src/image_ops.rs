use image::{imageops::FilterType, DynamicImage, ImageBuffer, Rgba, GenericImageView, ImageFormat};
use std::io::Cursor;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ImageError {
    #[error("Failed to decode image")]
    Decode(#[from] image::ImageError),
    #[error("Image processing failed: {0}")]
    Processing(String),
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

    // 5. Iterate over the pixels, normalize them to [0, 1], and populate the channel vectors.
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

pub fn postprocess_image(
    output_tensor: Vec<f32>,
    original_image_bytes: &[u8],
    width: u32,
    height: u32,
    strength: f32,
) -> Result<Vec<u8>, ImageError> {
    let stylized_img = tensor_to_image(output_tensor, width, height)?;
    let original_img = image::load_from_memory(original_image_bytes)?;
    let resized_original_img = original_img.resize_exact(width, height, FilterType::Triangle);

    let mut output_img = ImageBuffer::new(width, height);

    for (x, y, stylized_pixel) in stylized_img.enumerate_pixels() {
        let original_pixel = resized_original_img.get_pixel(x, y);
        let blended_pixel = blend_pixels(original_pixel, *stylized_pixel, strength);
        output_img.put_pixel(x, y, blended_pixel);
    }

    Ok(output_img.into_raw())
}

pub fn postprocess_video_frame(
    output_tensor: Vec<f32>,
    original_frame_pixels: &[u8],
    width: u32,
    height: u32,
    strength: f32,
) -> Result<Vec<u8>, ImageError> {
    let stylized_img = tensor_to_image(output_tensor, width, height)?;
    
    let original_frame_buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, original_frame_pixels.to_vec())
        .ok_or_else(|| ImageError::Processing("Failed to create ImageBuffer from raw pixels".to_string()))?;
    let original_frame = DynamicImage::ImageRgba8(original_frame_buffer);

    let mut output_img = ImageBuffer::new(width, height);

    for (x, y, stylized_pixel) in stylized_img.enumerate_pixels() {
        let original_pixel = original_frame.get_pixel(x, y);
        let blended_pixel = blend_pixels(original_pixel, *stylized_pixel, strength);
        output_img.put_pixel(x, y, blended_pixel);
    }

    Ok(output_img.into_raw())
}

fn tensor_to_image(
    tensor: Vec<f32>,
    width: u32,
    height: u32,
) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, ImageError> {
    let mut img_buf = ImageBuffer::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let r = (tensor[(y * width + x) as usize]).max(0.0).min(255.0) as u8;
            let g = (tensor[((height * width) + y * width + x) as usize])
                .max(0.0)
                .min(255.0) as u8;
            let b = (tensor[((2 * height * width) + y * width + x) as usize])
                .max(0.0)
                .min(255.0) as u8;
            img_buf.put_pixel(x, y, Rgba([r, g, b, 255]));
        }
    }

    Ok(img_buf)
}

pub fn blend_pixels(original: Rgba<u8>, stylized: Rgba<u8>, strength: f32) -> Rgba<u8> {
    let r = (original[0] as f32 * (1.0 - strength) + stylized[0] as f32 * strength).max(0.0).min(255.0) as u8;
    let g = (original[1] as f32 * (1.0 - strength) + stylized[1] as f32 * strength).max(0.0).min(255.0) as u8;
    let b = (original[2] as f32 * (1.0 - strength) + stylized[2] as f32 * strength).max(0.0).min(255.0) as u8;
    Rgba([r, g, b, 255])
}