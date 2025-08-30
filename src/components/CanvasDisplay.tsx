
import React from 'react';

const MAX_CANVAS_SIZE = 300;

interface CanvasDisplayProps {
  originalCanvasRef: React.RefObject<HTMLCanvasElement>;
  outputCanvasRef: React.RefObject<HTMLCanvasElement>;
}

export function CanvasDisplay({ originalCanvasRef, outputCanvasRef }: CanvasDisplayProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-8 mt-8">
      <div className="flex flex-col items-center">
        <h3>Original Image</h3>
        <canvas ref={originalCanvasRef} className="border border-gray-300" style={{ maxWidth: MAX_CANVAS_SIZE, maxHeight: MAX_CANVAS_SIZE, width: 'auto', height: 'auto' }}></canvas>
      </div>
      <div className="flex flex-col items-center">
        <h3>Stylized Image</h3>
        <canvas ref={outputCanvasRef} className="border border-gray-300" style={{ maxWidth: MAX_CANVAS_SIZE, maxHeight: MAX_CANVAS_SIZE, width: 'auto', height: 'auto' }}></canvas>
      </div>
    </div>
  );
}
