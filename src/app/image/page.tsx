"use client";

import { useImageUploader } from '../../hooks/useImageUploader';
import { useModelRunner } from '../../hooks/useModelRunner';
import { ImageControlPanel } from '../../components/ImageControlPanel';
import { CanvasDisplay } from '../../components/CanvasDisplay';
import { useEffect } from 'react';

export default function ImagePage() {
  const { 
    originalImageBytes, 
    fileName, 
    originalCanvasRef, 
    handleImageUpload, 
    resetImage,
    originalImageUrl
  } = useImageUploader();

  const model = useModelRunner(originalCanvasRef);

  useEffect(() => {
    if (originalImageBytes && model.runInferenceOnImage) {
      model.runInferenceOnImage(originalImageBytes);
    }
  }, [originalImageBytes, model.runInferenceOnImage, model.styleStrength, model.selectedModelId]);

  const handleReset = () => {
    resetImage();
    if (model.outputCanvasRef.current) {
        const ctx = model.outputCanvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, model.outputCanvasRef.current.width, model.outputCanvasRef.current.height);
      }
  };

  const handleDownload = () => {
    const canvas = model.outputCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'stylized-image.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-1/3">
          <ImageControlPanel
            fileName={fileName}
            models={model.models}
            selectedModelId={model.selectedModelId}
            styleStrength={model.styleStrength}
            handleImageUpload={handleImageUpload}
            handleStyleChange={model.handleStyleChange}
            handleStrengthChange={model.handleStrengthChange}
            handleDownload={handleDownload}
            handleReset={handleReset}
            outputLoaded={!!originalImageUrl}
          />
        </div>
        <div className="lg:w-2/3">
          <CanvasDisplay
            originalCanvasRef={originalCanvasRef}
            outputCanvasRef={model.outputCanvasRef}
            originalImageUrl={originalImageUrl}
            status={model.status}
          />
        </div>
      </div>
    </div>
  );
}
