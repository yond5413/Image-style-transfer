"use client";

import { useState, useRef, useEffect } from 'react';
import { InferenceSession, Tensor } from 'onnxruntime-web';
import * as ort from 'onnxruntime-web';

// Define a type for your model manifest entry for better type safety
interface ModelManifestEntry {
  id: string;
  name: string;
  file: string;
  size_mb: number;
  input: { name: string; shape: number[]; dtype: string; };
  output: { name: string; shape: number[]; dtype: string; };
  recommended_resolution: number;
  hash?: string;
}

export default function Home() {
  const [session, setSession] = useState<InferenceSession | null>(null);
  const [sessionCache, setSessionCache] = useState<Record<string, InferenceSession>>({});
  const [status, setStatus] = useState("Not loaded");
  const [models, setModels] = useState<ModelManifestEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [originalImageBytes, setOriginalImageBytes] = useState<ArrayBuffer | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [styleStrength, setStyleStrength] = useState(0.8);
  const [outputTensor, setOutputTensor] = useState<Tensor | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);


  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasmRef = useRef<any>(null);
  
  // Maximum display size for both canvases
  const MAX_CANVAS_SIZE = 300;

  // Load WASM and fetch models on component mount
  useEffect(() => {
    if (!(navigator as any).gpu) {
      console.error("WebGPU not supported on this browser!");
      setStatus("WebGPU not supported!");
      return;
    }

    async function loadWasmAndModels() {
      try {
        // Load WASM
        const wasm = await import("../wasm/pkg");
        await wasm.default();
        wasmRef.current = wasm;
        setStatus("WASM loaded");

        // Fetch models manifest
        const manifestResponse = await fetch('/models/manifest.json');
        const manifest = await manifestResponse.json();
        setModels(manifest.models);
        if (manifest.models.length > 0) {
          setSelectedModelId(manifest.models[0].id);
        }
      } catch (e: unknown) {
        if (e instanceof Error) {
          console.error(e.message);
        } else {
          console.error(e);
        }
        setStatus("Failed to load WASM or models");
      }
    }
    loadWasmAndModels();
  }, []);

  // Run inference when originalImageBytes or selectedModelId changes
  useEffect(() => {
    if (originalImageBytes && selectedModelId) {
      runInference(originalImageBytes, selectedModelId);
    }
  }, [originalImageBytes, selectedModelId]);

  // Rerun postprocessing when style strength changes
  useEffect(() => {
    if (outputTensor && originalImageBytes) {
      postprocessAndDisplay(outputTensor, originalImageBytes, styleStrength);
    }
  }, [styleStrength, outputTensor, originalImageBytes]);
  
  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) return;

      const imageUrl = URL.createObjectURL(file);
      setOriginalImageBytes(arrayBuffer);
      setOriginalImageUrl(imageUrl);
      setOutputTensor(null); // Clear previous output tensor

      // Draw original image to its canvas with size constraint
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        const canvas = originalCanvasRef.current;
        if (!canvas) return;
        
        // Calculate constrained dimensions while maintaining aspect ratio
        let displayWidth = img.width;
        let displayHeight = img.height;
        
        if (img.width > MAX_CANVAS_SIZE || img.height > MAX_CANVAS_SIZE) {
          const ratio = Math.min(MAX_CANVAS_SIZE / img.width, MAX_CANVAS_SIZE / img.height);
          displayWidth = Math.floor(img.width * ratio);
          displayHeight = Math.floor(img.height * ratio);
        }
        
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
      };
    };
    reader.readAsArrayBuffer(file);
  }

  function handleStyleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedModelId(event.target.value);
    setOutputTensor(null); // Clear previous output tensor
  }

  function handleStrengthChange(event: React.ChangeEvent<HTMLInputElement>) {
    setStyleStrength(parseFloat(event.target.value));
  }

  function handleDownload() {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'stylized-image.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function handleReset() {
    setOriginalImageBytes(null);
    setOriginalImageUrl(null);
    setOutputTensor(null);
    setFileName(null);
    setStatus("Not loaded");
    if (originalCanvasRef.current) {
      const ctx = originalCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, originalCanvasRef.current.width, originalCanvasRef.current.height);
    }
    if (outputCanvasRef.current) {
      const ctx = outputCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, outputCanvasRef.current.width, outputCanvasRef.current.height);
    }
    // Reset file input
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    if(input) input.value = "";
  }

  async function runInference(imageBytes: ArrayBuffer, modelId: string) {
    if (!wasmRef.current) {
      setStatus("WASM not loaded yet");
      return;
    }

    const modelData = models.find(m => m.id === modelId);
    if (!modelData) {
      setStatus(`Model ${modelId} not found`);
      return;
    }

    try {
      let currentSession = sessionCache[modelId];
      if (!currentSession) {
        setStatus(`Loading ${modelData.name} model...`);
        const modelFile = modelData.file;
        ort.env.wasm.wasmPaths = '/';
        
        currentSession = await InferenceSession.create(modelFile, { executionProviders: ['webgpu', 'wasm'] });
        setSessionCache(prev => ({ ...prev, [modelId]: currentSession }));
        setStatus(`Model ${modelData.name} loaded`);
      }
      
      setSession(currentSession);

      const modelShape = modelData.input.shape;
      const modelHeight = modelShape[2];
      const modelWidth = modelShape[3];

      setStatus("Preprocessing...");
      const tensor = wasmRef.current.preprocess(new Uint8Array(imageBytes), modelWidth, modelHeight);

      setStatus("Running inference...");
      const inputName = currentSession.inputNames[0];
      const feeds = { [inputName]: new Tensor('float32', tensor, modelShape) };
      const results = await currentSession.run(feeds);
      const outputName = currentSession.outputNames[0];
      const newOutputTensor = results[outputName];
      
      setOutputTensor(newOutputTensor); // Save tensor to state
      
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error(e);
        setStatus(`Error: ${e.message}`);
      } else {
        console.error(e);
        setStatus(`Error: An unknown error occurred`);
      }
    }
  }

  function postprocessAndDisplay(tensor: Tensor, imageBytes: ArrayBuffer, strength: number) {
    if (!wasmRef.current || !selectedModelId) return;
    
    const modelData = models.find(m => m.id === selectedModelId);
    if (!modelData) return;

    const modelHeight = modelData.input.shape[2];
    const modelWidth = modelData.input.shape[3];

    setStatus("Postprocessing...");
    const outputRgba = wasmRef.current.postprocess(tensor.data, new Uint8Array(imageBytes), modelWidth, modelHeight, strength);

    setStatus("Done!");
    const outputCanvas = outputCanvasRef.current;
    if (!outputCanvas) return;
    
    const originalCanvas = originalCanvasRef.current;
    if (originalCanvas) {
      outputCanvas.width = originalCanvas.width;
      outputCanvas.height = originalCanvas.height;
    } else {
      outputCanvas.width = modelWidth;
      outputCanvas.height = modelHeight;
    }
    
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) return;

    // Draw the raw RGBA data to an offscreen canvas
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = modelWidth;
    offscreenCanvas.height = modelHeight;
    const offscreenCtx = offscreenCanvas.getContext('2d');
    if (!offscreenCtx) return;
    offscreenCtx.putImageData(new ImageData(new Uint8ClampedArray(outputRgba), modelWidth, modelHeight), 0, 0);

    // Scale the offscreen canvas to the display canvas
    outputCtx.drawImage(offscreenCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 md:p-12 lg:p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex mb-8">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Status: {status}
        </p>
      </div>

      <div className="relative flex flex-col items-center gap-4 mt-8 w-full max-w-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <div className="flex flex-col">
                <label htmlFor="file-upload" className="cursor-pointer p-2 border rounded bg-blue-500 text-white text-center truncate">
                    {fileName || "Select Image"}
                </label>
                <input id="file-upload" type="file" onChange={handleImageUpload} className="hidden"/>
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
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-8 mt-8">
        <div className="flex flex-col items-center">
          <h3>Original Image</h3>
          <canvas ref={originalCanvasRef} className="border border-gray-300" style={{maxWidth: MAX_CANVAS_SIZE, maxHeight: MAX_CANVAS_SIZE, width: 'auto', height: 'auto'}}></canvas>
        </div>
        <div className="flex flex-col items-center">
          <h3>Stylized Image</h3>
          <canvas ref={outputCanvasRef} className="border border-gray-300" style={{maxWidth: MAX_CANVAS_SIZE, maxHeight: MAX_CANVAS_SIZE, width: 'auto', height: 'auto'}}></canvas>
        </div>
      </div>
    </main>
  );
}
