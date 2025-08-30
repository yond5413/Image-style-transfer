
import { useState, useRef } from 'react';
import { Tensor } from 'onnxruntime-web';

const MAX_CANVAS_SIZE = 300;

export function useImageUploader() {
  const [originalImageBytes, setOriginalImageBytes] = useState<ArrayBuffer | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) return;

      const imageUrl = URL.createObjectURL(file);
      setOriginalImageBytes(arrayBuffer);
      setOriginalImageUrl(imageUrl);

      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        const canvas = originalCanvasRef.current;
        if (!canvas) return;

        let displayWidth = img.width;
        let displayHeight = img.height;

        if (img.width > MAX_CANVAS_SIZE || img.height > MAX_CANVAS_SIZE) {
          const ratio = Math.min(MAX_CANVAS_SIZE / img.width, MAX_CANVAS_SIZE / img.height);
          displayWidth = Math.floor(img.width * ratio);
          displayHeight = Math.floor(img.height * ratio);
        }

        canvas.width = displayWidth;
        canvas.height = displayHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
      };
    };
    reader.readAsArrayBuffer(file);
  };

  const resetImage = () => {
    setOriginalImageBytes(null);
    setOriginalImageUrl(null);
    setFileName(null);
    if (originalCanvasRef.current) {
      const ctx = originalCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, originalCanvasRef.current.width, originalCanvasRef.current.height);
    }
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    if(input) input.value = "";
  };

  return {
    originalImageBytes,
    originalImageUrl,
    fileName,
    originalCanvasRef,
    handleImageUpload,
    resetImage,
  };
}
