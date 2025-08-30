import React from 'react';

interface CanvasDisplayProps {
  originalCanvasRef: React.RefObject<HTMLCanvasElement>;
  outputCanvasRef: React.RefObject<HTMLCanvasElement>;
  originalImageUrl: string | null;
  status: string;
  videoRef?: React.RefObject<HTMLVideoElement>;
  width: number;
  height: number;
}

export function CanvasDisplay({ originalCanvasRef, outputCanvasRef, originalImageUrl, status, videoRef, width, height }: CanvasDisplayProps) {
  const isLoading = status.includes("Loading") || status.includes("Preprocessing") || status.includes("Running");

  const containerStyle = { width: `${width}px`, height: `${height}px` };

  return (
    <div className="flex flex-col sm:flex-row gap-8 mt-8">
      <div className="flex flex-col items-center">
        <h3>Original Image</h3>
        <div className="relative border border-gray-300" style={containerStyle}>
          {videoRef ? (
            <video ref={videoRef} className="w-full h-full object-fill" autoPlay playsInline muted></video>
          ) : (
            <canvas ref={originalCanvasRef} className="w-full h-full"></canvas>
          )}
          {!originalImageUrl && !videoRef && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-500">
              Upload an image or start webcam
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center">
        <h3>Stylized Image</h3>
        <div className="relative border border-gray-300" style={containerStyle}>
          <canvas ref={outputCanvasRef} className="w-full h-full"></canvas>
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 bg-opacity-50">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
              <p className="mt-4 text-lg font-semibold">{status}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}