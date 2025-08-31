"use client";

import { useImageProcessor } from '../../hooks/useImageProcessor';
import { ImageControlPanel } from '../../components/ImageControlPanel';
import { CanvasDisplay } from '../../components/CanvasDisplay';

const DISPLAY_RESOLUTION = 480;

export default function ImagePage() {
  const {
    status,
    models,
    selectedModelId,
    styleStrength,
    fileName,
    originalImageUrl,
    originalCanvasRef,
    outputCanvasRef,
    handleImageUpload,
    handleStyleChange,
    handleStrengthChange,
    reset,
  } = useImageProcessor();

  const handleDownload = () => {
    const canvas = outputCanvasRef.current;
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
            models={models}
            selectedModelId={selectedModelId}
            styleStrength={styleStrength}
            handleImageUpload={handleImageUpload}
            handleStyleChange={handleStyleChange}
            handleStrengthChange={handleStrengthChange}
            handleDownload={handleDownload}
            handleReset={reset}
            outputLoaded={!!originalImageUrl}
          />
        </div>
        <div className="lg:w-2/3">
          <CanvasDisplay
            originalCanvasRef={originalCanvasRef}
            outputCanvasRef={outputCanvasRef}
            originalImageUrl={originalImageUrl}
            status={status}
            width={DISPLAY_RESOLUTION}
            height={DISPLAY_RESOLUTION}
          />
        </div>
      </div>
    </div>
  );
}