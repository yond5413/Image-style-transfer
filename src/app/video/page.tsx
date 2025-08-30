"use client";

import { useModelRunner } from '../../hooks/useModelRunner';
import { VideoControlPanel } from '../../components/VideoControlPanel';
import { CanvasDisplay } from '../../components/CanvasDisplay';
import { useState, useEffect, useRef } from 'react';

const PROCESSING_RESOLUTION = 224;
const DISPLAY_RESOLUTION = 360;

export default function VideoPage() {
  const [isWebcamOn, setIsWebcamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const processingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const modelHookCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const model = useModelRunner(modelHookCanvasRef);

  const handleWebcam = () => {
    setIsWebcamOn(!isWebcamOn);
  };

  // Effect for handling the webcam stream
  useEffect(() => {
    let stream: MediaStream | null = null;
    const videoElement = videoRef.current;

    if (isWebcamOn) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(s => {
          stream = s;
          if (videoElement) {
            videoElement.srcObject = stream;
            videoElement.play();
          }
        })
        .catch(err => {
          console.error("Error accessing webcam: ", err);
          setIsWebcamOn(false);
        });
    } else {
      if (videoElement && videoElement.srcObject) {
        const tracks = (videoElement.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
      }
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isWebcamOn]);

  // Effect for handling the model processing loop
  useEffect(() => {
    let animationFrameId: number | null = null;
    const videoElement = videoRef.current;
    const processingCanvas = processingCanvasRef.current;

    const loop = async () => {
      if (isWebcamOn && videoElement && processingCanvas && outputCanvasRef.current && model.runInferenceOnFrame && model.status.includes("loaded")) {
        const processingCtx = processingCanvas.getContext('2d');
        if (processingCtx) {
          processingCtx.drawImage(videoElement, 0, 0, processingCanvas.width, processingCanvas.height);
          const imageData = await model.runInferenceOnFrame(processingCanvas);
          if (imageData) {
            const outputCtx = outputCanvasRef.current.getContext('2d');
            if (outputCtx) {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = imageData.width;
              tempCanvas.height = imageData.height;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                tempCtx.putImageData(imageData, 0, 0);
                outputCtx.drawImage(tempCanvas, 0, 0, outputCanvasRef.current.width, outputCanvasRef.current.height);
              }
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    if (isWebcamOn) {
      if (processingCanvas) {
        processingCanvas.width = PROCESSING_RESOLUTION;
        processingCanvas.height = PROCESSING_RESOLUTION;
      }
      animationFrameId = requestAnimationFrame(loop);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isWebcamOn, model]);

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
            handleWebcam={handleWebcam}
            isWebcamOn={isWebcamOn}
          />
        </div>
        <div className="lg:w-2/3">
          <CanvasDisplay
            originalCanvasRef={modelHookCanvasRef}
            outputCanvasRef={outputCanvasRef}
            originalImageUrl={isWebcamOn ? "webcam" : null}
            status={model.status}
            videoRef={videoRef}
            width={DISPLAY_RESOLUTION}
            height={DISPLAY_RESOLUTION}
          />
        </div>
      </div>
      <canvas ref={processingCanvasRef} style={{ display: 'none' }} />
      <canvas ref={modelHookCanvasRef} style={{ display: 'none' }} />
    </div>
  );
}
