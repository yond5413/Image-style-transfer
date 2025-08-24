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
  const [status, setStatus] = useState("Not loaded");
  const [models, setModels] = useState<ModelManifestEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [originalImageBytes, setOriginalImageBytes] = useState<ArrayBuffer | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasmRef = useRef<any>(null);

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
      } catch (e) {
        console.error(e);
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

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) return;

      const imageUrl = URL.createObjectURL(file);
      setOriginalImageBytes(arrayBuffer);
      setOriginalImageUrl(imageUrl);

      // Draw original image to its canvas
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        const canvas = originalCanvasRef.current;
        if (!canvas) return;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, img.width, img.height);
      };
    };
    reader.readAsArrayBuffer(file);
  }

  function handleStyleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedModelId(event.target.value);
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

    setStatus(`Loading ${modelData.name} model...`);

    try {
      const modelFile = modelData.file;
      const modelShape = modelData.input.shape;
      const modelHeight = modelShape[2];
      const modelWidth = modelShape[3];

      ort.env.wasm.wasmPaths = '/';
      const currentSession = await InferenceSession.create(modelFile, { executionProviders: ['webgpu', 'wasm'] });
      setSession(currentSession);
      setStatus(`Model ${modelData.name} loaded`);

      const image = new Image();
      image.src = URL.createObjectURL(new Blob([imageBytes]));
      image.onload = async () => {
        setStatus("Preprocessing...");
        const tensor = wasmRef.current.preprocess(new Uint8Array(imageBytes), modelWidth, modelHeight);

        setStatus("Running inference...");
        const inputName = currentSession.inputNames[0];
        const feeds = { [inputName]: new Tensor('float32', tensor, modelShape) };
        const results = await currentSession.run(feeds);
        const outputName = currentSession.outputNames[0];
        const outputTensor = results[outputName];

        setStatus("Postprocessing...");
        const outputRgba = wasmRef.current.postprocess(outputTensor.data, new Uint8Array(imageBytes), modelWidth, modelHeight, 0.8);

        setStatus("Done!");
        const outputCanvas = outputCanvasRef.current;
        if (!outputCanvas) return;
        outputCanvas.width = modelWidth;
        outputCanvas.height = modelHeight;
        const outputCtx = outputCanvas.getContext('2d');
        if (!outputCtx) return;
        outputCtx.putImageData(new ImageData(new Uint8ClampedArray(outputRgba), modelWidth, modelHeight), 0, 0);
      };
    } catch (e) {
      console.error(e);
      setStatus(`Error: ${e.message}`);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Status: {status}
        </p>
      </div>

      <div className="relative flex flex-col items-center gap-4 mt-8">
        <input type="file" onChange={handleImageUpload} />
        {models.length > 0 && selectedModelId && (
          <select onChange={handleStyleChange} value={selectedModelId} className="p-2 border rounded">
            {models.map(model => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-8 mt-8">
        <div className="flex flex-col items-center">
          <h3>Original Image</h3>
          <canvas ref={originalCanvasRef} className="border border-gray-300"></canvas>
          {originalImageUrl && <img src={originalImageUrl} alt="Original" className="mt-2 max-w-xs max-h-xs" style={{ display: 'none' }} />}
        </div>
        <div className="flex flex-col items-center">
          <h3>Stylized Image</h3>
          <canvas ref={outputCanvasRef} className="border border-gray-300"></canvas>
        </div>
      </div>
    </main>
  );
}
