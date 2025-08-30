import React from 'react';

interface ModelManifestEntry {
  id: string;
  name: string;
}

interface VideoControlPanelProps {
  models: ModelManifestEntry[];
  selectedModelId: string | null;
  styleStrength: number;
  isWebcamOn: boolean;
  handleStyleChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  handleStrengthChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleWebcam: () => void;
}

export function VideoControlPanel({ 
  models, 
  selectedModelId, 
  styleStrength, 
  isWebcamOn,
  handleStyleChange, 
  handleStrengthChange, 
  handleWebcam,
}: VideoControlPanelProps) {
  return (
    <div className="relative flex flex-col items-center gap-4 mt-8 w-full max-w-md">
      <div className="grid grid-cols-1 gap-4 w-full">
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
          disabled={!isWebcamOn}
        />
      </div>

      <div className="flex gap-4 mt-4">
        <button onClick={handleWebcam} className={`p-2 border rounded text-white ${isWebcamOn ? 'bg-red-500' : 'bg-green-500'}`}>{isWebcamOn ? 'Stop Webcam' : 'Start Webcam'}</button>
      </div>
    </div>
  );
}