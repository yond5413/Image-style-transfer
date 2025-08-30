
import React from 'react';
import { Tensor } from 'onnxruntime-web';

interface ModelManifestEntry {
  id: string;
  name: string;
}

interface ControlPanelProps {
  fileName: string | null;
  models: ModelManifestEntry[];
  selectedModelId: string | null;
  styleStrength: number;
  outputTensor: Tensor | null;
  handleImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleStyleChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  handleStrengthChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleDownload: () => void;
  handleReset: () => void;
  handleWebcam: () => void;
  isWebcamOn: boolean;
}

export function ControlPanel({ 
  fileName, 
  models, 
  selectedModelId, 
  styleStrength, 
  outputTensor, 
  handleImageUpload, 
  handleStyleChange, 
  handleStrengthChange, 
  handleDownload, 
  handleReset, 
  handleWebcam,
  isWebcamOn
}: ControlPanelProps) {
  return (
    <div className="relative flex flex-col items-center gap-4 mt-8 w-full max-w-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        <div className="flex flex-col">
          <label htmlFor="file-upload" className="cursor-pointer p-2 border rounded bg-blue-500 text-white text-center truncate">
            {fileName || "Select Image"}
          </label>
          <input id="file-upload" type="file" onChange={handleImageUpload} className="hidden" />
        </div>
        <div className="flex flex-col">
          {models.length > 0 && selectedModelId && (
            <select onChange={handleStyleChange} value={selectedModelId} className="p-2 border rounded w-full h-full">
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="w-full mt-4">
        <label htmlFor="styleStrength" className="block text-center mb-2">Style Strength: {styleStrength.toFixed(2)}</label>
        <input
          id="styleStrength"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={styleStrength}
          onChange={handleStrengthChange}
          className="w-full"
          disabled={!outputTensor}
        />
      </div>

      <div className="flex gap-4 mt-4">
        <button onClick={handleDownload} disabled={!outputTensor} className="p-2 border rounded bg-blue-500 text-white disabled:bg-gray-400">Download</button>
        <button onClick={handleReset} className="p-2 border rounded bg-red-500 text-white">Reset</button>
        <button onClick={handleWebcam} className={`p-2 border rounded text-white ${isWebcamOn ? 'bg-red-500' : 'bg-green-500'}`}>{isWebcamOn ? 'Stop Webcam' : 'Start Webcam'}</button>
      </div>
    </div>
  );
}
