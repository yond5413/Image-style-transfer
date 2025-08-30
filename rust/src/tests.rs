
use crate::image_ops::blend_pixels;
use image::Rgba;

#[test]
fn test_blend_pixels() {
    let original = Rgba([100, 100, 100, 255]);
    let stylized = Rgba([200, 200, 200, 255]);
    let strength = 0.5;
    let blended = blend_pixels(original, stylized, strength);
    assert_eq!(blended, Rgba([150, 150, 150, 255]));
}
