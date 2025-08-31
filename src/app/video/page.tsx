"use client";

import { useModelRunner } from '../../hooks/useModelRunner';
import { useWebcam } from '../../hooks/useWebcam';
import { VideoControlPanel } from '../../components/VideoControlPanel';
import { CanvasDisplay } from '../../components/CanvasDisplay';
import { useRef } from 'react';

const DISPLAY_RESOLUTION = 360;

export default function VideoPage() {
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // The model runner hook is still needed for model loading and inference logic
  const modelHookCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const model = useModelRunner(modelHookCanvasRef);

  // The new webcam hook encapsulates all webcam state and logic
  const {
    isVideoRunning,
    videoRef,
    startWebcam,
    stopWebcam,
  } = useWebcam(model.runInferenceOnFrame, outputCanvasRef, model.isModelLoading);

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
            models={model.models}
            selectedModelId={model.selectedModelId}
            styleStrength={model.styleStrength}
            handleStyleChange={model.handleStyleChange}
            handleStrengthChange={model.handleStrengthChange}
            handleWebcam={handleWebcamToggle}
            isWebcamOn={isVideoRunning}
          />
        </div>
        <div className="lg:w-2/3">
          <CanvasDisplay
            originalCanvasRef={modelHookCanvasRef} // This is unused in video mode but the component expects it
            outputCanvasRef={outputCanvasRef}
            originalImageUrl={isVideoRunning ? "webcam" : null}
            status={model.status}
            videoRef={videoRef}
            width={DISPLAY_RESOLUTION}
            height={DISPLAY_RESOLUTION}
          />
        </div>
      </div>
      {/* The hidden processing canvas is no longer needed here, it's handled by the hook */}
      <canvas ref={modelHookCanvasRef} style={{ display: 'none' }} />
    </div>
  );
}