"use client";

import { useImageUploader } from '../hooks/useImageUploader';
import { useModelRunner } from '../hooks/useModelRunner';
import { ControlPanel } from '../components/ControlPanel';
import { CanvasDisplay } from '../components/CanvasDisplay';
import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [isWebcamOn, setIsWebcamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { 
    originalImageBytes, 
    fileName, 
    originalCanvasRef, 
    handleImageUpload, 
    resetImage 
  } = useImageUploader();

  const model = useModelRunner(originalImageBytes, originalCanvasRef);

  // useEffect(() => {
  //   if (originalImageBytes) {
  //     model.setOutputTensor(null);
  //   }
  // }, [originalImageBytes, model]);

  const handleDownload = () => {
    const canvas = model.outputCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'stylized-image.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleReset = () => {
    resetImage();
    model.resetModel();
    if (model.outputCanvasRef.current) {
        const ctx = model.outputCanvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, model.outputCanvasRef.current.width, model.outputCanvasRef.current.height);
      }
  };

  const handleWebcam = () => {
    setIsWebcamOn(!isWebcamOn);
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;
    const videoElement = videoRef.current;

    const loop = async () => {
      if (videoElement && originalCanvasRef.current && model.selectedModelId) {
        const canvas = originalCanvasRef.current;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          ctx.drawImage(videoElement, 0, 0, videoElement.videoWidth, videoElement.videoHeight);

          canvas.toBlob(async (blob) => {
            if (blob) {
              const imageBytes = await blob.arrayBuffer();
              await model.runInference(imageBytes, model.selectedModelId!);
            }
            if (isWebcamOn) {
              animationFrameId = requestAnimationFrame(loop);
            }
          }, 'image/jpeg', 0.8);
        }
      }
    };

    if (isWebcamOn) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(s => {
          stream = s;
          if (videoElement) {
            videoElement.srcObject = stream;
            videoElement.play();
            animationFrameId = requestAnimationFrame(loop);
          }
        })
        .catch(err => {
          console.error("Error accessing webcam: ", err);
          setIsWebcamOn(false);
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (videoElement) {
        videoElement.srcObject = null;
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isWebcamOn, model, originalCanvasRef]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 md:p-12 lg:p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex mb-8">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Status: {model.status}
        </p>
      </div>

      <ControlPanel
        fileName={fileName}
        models={model.models}
        selectedModelId={model.selectedModelId}
        styleStrength={model.styleStrength}
        outputTensor={model.outputTensor}
        handleImageUpload={handleImageUpload}
        handleStyleChange={model.handleStyleChange}
        handleStrengthChange={model.handleStrengthChange}
        handleDownload={handleDownload}
        handleReset={handleReset}
        handleWebcam={handleWebcam}
        isWebcamOn={isWebcamOn}
      />

      <CanvasDisplay
        originalCanvasRef={originalCanvasRef}
        outputCanvasRef={model.outputCanvasRef}
      />
      <video ref={videoRef} style={{ display: 'none' }} />
    </main>
  );
}