import { useState, useRef, useCallback, RefObject, useEffect } from 'react';

export function useWebcam(
  runInference: (canvas: HTMLCanvasElement) => Promise<ImageData | undefined>,
  outputCanvasRef: RefObject<HTMLCanvasElement | null>,
  isModelLoading: boolean
) {
  const [isVideoRunning, setIsVideoRunning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const requestRef = useRef<number>();
  const runInferenceRef = useRef(runInference);

  useEffect(() => {
    runInferenceRef.current = runInference;
  }, [runInference]);

  const videoLoop = useCallback(async () => {
    if (videoRef.current && videoRef.current.readyState >= 3 && outputCanvasRef.current) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = videoRef.current.videoWidth;
      tempCanvas.height = videoRef.current.videoHeight;
      const tempCtx = tempCanvas.getContext('2d');

      if (tempCtx) {
        tempCtx.drawImage(videoRef.current, 0, 0, tempCanvas.width, tempCanvas.height);

        if (isModelLoading) {
          const outputCtx = outputCanvasRef.current.getContext('2d');
          if (outputCtx) {
            outputCtx.drawImage(tempCanvas, 0, 0, outputCanvasRef.current.width, outputCanvasRef.current.height);
          }
        } else {
          const outputImageData = await runInferenceRef.current(tempCanvas);
          
          if (outputImageData) {
            const outputCtx = outputCanvasRef.current.getContext('2d');
            if (outputCtx) {
              // Create a temporary canvas to hold the raw model output
              const tempOutCanvas = document.createElement('canvas');
              tempOutCanvas.width = outputImageData.width;
              tempOutCanvas.height = outputImageData.height;
              const tempOutCtx = tempOutCanvas.getContext('2d');
              if (tempOutCtx) {
                tempOutCtx.putImageData(outputImageData, 0, 0);
                // Draw the model output to the visible canvas, scaling it to fit
                outputCtx.drawImage(tempOutCanvas, 0, 0, outputCanvasRef.current.width, outputCanvasRef.current.height);
              }
            }
          }
        }
      }
    }
    requestRef.current = requestAnimationFrame(videoLoop);
  }, [outputCanvasRef, isModelLoading]);

  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsVideoRunning(true);
        requestRef.current = requestAnimationFrame(videoLoop);
      }
    } catch (err) {
      console.error("Error accessing webcam: ", err);
    }
  }, [videoLoop]);

  const stopWebcam = useCallback(() => {
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    setIsVideoRunning(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  return { isVideoRunning, videoRef, startWebcam, stopWebcam };
}
