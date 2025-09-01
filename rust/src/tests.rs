use crate::image_ops::{blend_pixels, preprocess_image, tensor_to_image, postprocess_image};
use image::{ImageBuffer, Rgba};

#[test]
fn test_blend_pixels() {
    let original = Rgba([100, 100, 100, 255]);
    let stylized = Rgba([200, 200, 200, 255]);
    let strength = 0.5;
    let blended = blend_pixels(original, stylized, strength);
    assert_eq!(blended, Rgba([150, 150, 150, 255]));
}

#[test]
fn test_preprocess_image_valid() {
    // Create a dummy 1x1 black pixel image
    let mut img_buf: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(1, 1);
    img_buf.put_pixel(0, 0, Rgba([0u8, 0u8, 0u8, 255u8]));
    let mut bytes: Vec<u8> = Vec::new();
    img_buf.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png).unwrap();

    let result = preprocess_image(&bytes, 1, 1);
    assert!(result.is_ok());
    let tensor = result.unwrap();
    // 1x1 image, 3 channels (RGB)
    assert_eq!(tensor.len(), 3);
    // All values should be 0.0 for a black pixel
    assert_eq!(tensor, vec![0.0, 0.0, 0.0]);
}

#[test]
fn test_tensor_to_image_valid() {
    // A tensor representing a 1x1 red pixel
    let tensor = vec![1.0, 0.0, 0.0];
    let result = tensor_to_image(tensor, 1, 1);
    assert!(result.is_ok());
    let img_buf = result.unwrap();
    assert_eq!(img_buf.width(), 1);
    assert_eq!(img_buf.height(), 1);
    assert_eq!(img_buf.get_pixel(0, 0), &Rgba([255, 0, 0, 255]));
}

#[test]
fn test_tensor_to_image_invalid_len() {
    // Tensor with incorrect length for a 1x1 image
    let tensor = vec![1.0, 0.0];
    let result = tensor_to_image(tensor, 1, 1);
    assert!(result.is_err());
}

#[test]
fn test_postprocess_image_flow() {
    // 1x1 red pixel tensor
    let tensor = vec![1.0, 0.0, 0.0];
    
    // 1x1 black pixel original image
    let mut img_buf: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(1, 1);
    img_buf.put_pixel(0, 0, Rgba([0u8, 0u8, 0u8, 255u8]));
    let mut bytes: Vec<u8> = Vec::new();
    img_buf.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png).unwrap();

    // Strength 0.5, so the result should be halfway between black and red -> dark red
    let strength = 0.5;
    let result = postprocess_image(tensor, &bytes, 1, 1, strength);
    assert!(result.is_ok());
    let raw_pixels = result.unwrap();
    assert_eq!(raw_pixels.len(), 4); // RGBA
    assert_eq!(raw_pixels, vec![127, 0, 0, 255]); // 255 * 0.5 = 127.5 -> 127
}