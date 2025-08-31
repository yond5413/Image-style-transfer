"use client";

import { useVideoProcessor } from '../../hooks/useVideoProcessor';
import { VideoControlPanel } from '../../components/VideoControlPanel';
import { CanvasDisplay } from '../../components/CanvasDisplay';

const DISPLAY_RESOLUTION = 360;

export default function VideoPage() {
  const {
    status,
    models,
    selectedModelId,
    styleStrength,
    isVideoRunning,
    videoRef,
    outputCanvasRef,
    startWebcam,
    stopWebcam,
    handleStyleChange,
    handleStrengthChange,
  } = useVideoProcessor();

  const handleWebcamToggle = () => {
    if (isVideoRunning) {
      stopWebcam();
    } else {
      startWebcam();
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-1/3">
          <VideoControlPanel
            models={models}
            selectedModelId={selectedModelId}
            styleStrength={styleStrength}
            handleStyleChange={handleStyleChange}
            handleStrengthChange={handleStrengthChange}
            handleWebcam={handleWebcamToggle}
            isWebcamOn={isVideoRunning}
          />
        </div>
        <div className="lg:w-2/3">
          <CanvasDisplay
            originalCanvasRef={videoRef as any} // Casting because the component expects a Canvas ref
            outputCanvasRef={outputCanvasRef}
            originalImageUrl={isVideoRunning ? "webcam" : null}
            status={status}
            videoRef={videoRef}
            width={DISPLAY_RESOLUTION}
            height={DISPLAY_RESOLUTION}
          />
        </div>
      </div>
    </div>
  );
}
