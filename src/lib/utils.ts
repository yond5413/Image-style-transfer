import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function drawScaledImageDataToCanvas(
  targetCanvas: HTMLCanvasElement,
  pixelData: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
) {
  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) return;

  // Create a Uint8ClampedArray from the pixelData to satisfy ImageData constructor
  const clampedPixelData = new Uint8ClampedArray(pixelData);
  const imageData = new ImageData(clampedPixelData, sourceWidth, sourceHeight);
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = sourceWidth;
  tempCanvas.height = sourceHeight;
  tempCanvas.getContext('2d')?.putImageData(imageData, 0, 0);

  targetCtx.drawImage(tempCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
}