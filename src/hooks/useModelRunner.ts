
import { useState, useRef, useEffect, useCallback } from 'react';
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

interface ModelManifest {
  models: ModelManifestEntry[];
}

export function useModelRunner(originalImageBytes: ArrayBuffer | null, originalCanvasRef: React.RefObject<HTMLCanvasElement>) {
  const [session, setSession] = useState<InferenceSession | null>(null);
  const [sessionCache, setSessionCache] = useState<Record<string, InferenceSession>>({});
  const [status, setStatus] = useState("Not loaded");
  const [models, setModels] = useState<ModelManifestEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [styleStrength, setStyleStrength] = useState(0.8);
  const [outputTensor, setOutputTensor] = useState<Tensor | null>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasmRef = useRef<any>(null);

  useEffect(() => {
    if (!(navigator as any).gpu) {
      console.error("WebGPU not supported on this browser!");
      setStatus("WebGPU not supported!");
      return;
    }

    async function loadWasmAndModels() {
      try {
        const wasm = await import("../wasm/pkg");
        await wasm.default();
        wasmRef.current = wasm;
        setStatus("WASM loaded");

        const manifestResponse = await fetch('/models/manifest.json');
        const manifest: ModelManifest = await manifestResponse.json();
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

  const runInference = useCallback(async (imageBytes: ArrayBuffer, modelId: string) => {
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
      
      setOutputTensor(newOutputTensor);
      
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error(e);
        setStatus(`Error: ${e.message}`);
      } else {
        console.error(e);
        setStatus(`Error: An unknown error occurred`);
      }
    }
  }, [models, sessionCache, setStatus, setSession, setOutputTensor]);

  const postprocessAndDisplay = useCallback((tensor: Tensor, imageBytes: ArrayBuffer, strength: number) => {
    if (!wasmRef.current || !selectedModelId) return;
    
    const modelData = models.find(m => m.id === selectedModelId);
    if (!modelData) return;

    const modelHeight = modelData.input.shape[2];
    const modelWidth = modelData.input.shape[3];

    setStatus("Postprocessing...");
    const pixelData = wasmRef.current.postprocess(tensor.data, new Uint8Array(imageBytes), modelWidth, modelHeight, strength);

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

    const imageData = new ImageData(new Uint8ClampedArray(pixelData), modelWidth, modelHeight);
    
    // Create a temporary canvas to draw the model-sized image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = modelWidth;
    tempCanvas.height = modelHeight;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.putImageData(imageData, 0, 0);

    // Scale the image from the temporary canvas to the output canvas
    outputCtx.drawImage(tempCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

  }, [selectedModelId, models, setStatus, originalCanvasRef]);

  useEffect(() => {
    if (originalImageBytes && selectedModelId) {
      runInference(originalImageBytes, selectedModelId);
    }
  }, [originalImageBytes, selectedModelId, runInference]);

  useEffect(() => {
    if (outputTensor && originalImageBytes) {
      postprocessAndDisplay(outputTensor, originalImageBytes, styleStrength);
    }
  }, [styleStrength, outputTensor, originalImageBytes, postprocessAndDisplay]);

  const handleStyleChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModelId(event.target.value);
    setOutputTensor(null);
  }, []);

  const handleStrengthChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setStyleStrength(parseFloat(event.target.value));
  }, []);

  const resetModel = useCallback(() => {
    setOutputTensor(null);
    setStatus("Not loaded");
  }, []);

  return {
    status,
    models,
    selectedModelId,
    styleStrength,
    outputTensor,
    outputCanvasRef,
    handleStyleChange,
    handleStrengthChange,
    resetModel,
    setOutputTensor,
    setStatus,
    runInference
  };
}
