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

export function useModelRunner(originalCanvasRef: React.RefObject<HTMLCanvasElement>) {
  const [session, setSession] = useState<InferenceSession | null>(null);
  const [sessionCache, setSessionCache] = useState<Record<string, InferenceSession>>({});
  const [status, setStatus] = useState("Loading WebAssembly...");
  const [models, setModels] = useState<ModelManifestEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [styleStrength, setStyleStrength] = useState(0.8);
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
        setStatus("WebAssembly loaded. Select a style and image to start.");

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

  const createSession = useCallback(async (modelId: string) => {
    let currentSession = sessionCache[modelId];
    if (currentSession) {
      if (session !== currentSession) {
        setSession(currentSession);
      }
      return currentSession;
    }

    const modelData = models.find(m => m.id === modelId);
    if (!modelData) {
      setStatus(`Model ${modelId} not found`);
      return null;
    }

    setStatus(`Loading ${modelData.name} model...`);
    const modelFile = modelData.file;
    ort.env.wasm.wasmPaths = '/';
    currentSession = await InferenceSession.create(modelFile, { executionProviders: ['webgpu', 'wasm'] });

    setStatus(`Warming up ${modelData.name} model...`);
    const modelShape = modelData.input.shape;
    const dummyInput = new Tensor('float32', new Float32Array(modelShape[1] * modelShape[2] * modelShape[3]), modelShape);
    const inputName = currentSession.inputNames[0];
    const feeds = { [inputName]: dummyInput };
    await currentSession.run(feeds);

    setSessionCache(prev => ({ ...prev, [modelId]: currentSession }));
    setSession(currentSession);
    setStatus(`Model ${modelData.name} loaded`);
    return currentSession;
  }, [models, session, sessionCache, setSession, setSessionCache, setStatus]);

  useEffect(() => {
    if (selectedModelId) {
      createSession(selectedModelId);
    }
  }, [selectedModelId, createSession]);

  const runInferenceOnImage = useCallback(async (imageBytes: ArrayBuffer) => {
    if (!wasmRef.current || !selectedModelId) return;

    try {
      const currentSession = await createSession(selectedModelId);
      if (!currentSession) return;

      const modelData = models.find(m => m.id === selectedModelId)!;
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

      setStatus("Postprocessing...");
      const pixelData = wasmRef.current.postprocess(newOutputTensor.data, new Uint8Array(imageBytes), modelWidth, modelHeight, styleStrength);

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
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = modelWidth;
      tempCanvas.height = modelHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;
      tempCtx.putImageData(imageData, 0, 0);

      outputCtx.drawImage(tempCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error(e.message);
      } else {
        console.error(e);
        setStatus(`Error: An unknown error occurred`);
      }
    }
  }, [createSession, selectedModelId, styleStrength, models, setStatus, originalCanvasRef]);

  const runInferenceOnFrame = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!wasmRef.current || !selectedModelId) {
      return;
    }

    try {
      const currentSession = await createSession(selectedModelId);
      if (!currentSession) return;

      const modelData = models.find(m => m.id === selectedModelId)!;
      const modelShape = modelData.input.shape;
      const modelHeight = modelShape[2];
      const modelWidth = modelShape[3];

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const framePixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      const tensor = wasmRef.current.preprocess_frame(new Uint8Array(framePixelData), canvas.width, canvas.height, modelWidth, modelHeight);

      const inputName = currentSession.inputNames[0];
      const feeds = { [inputName]: new Tensor('float32', tensor, modelShape) };
      const results = await currentSession.run(feeds);
      const outputName = currentSession.outputNames[0];
      const newOutputTensor = results[outputName];

      const pixelData = wasmRef.current.postprocess_frame(newOutputTensor.data, new Uint8Array(framePixelData), modelWidth, modelHeight, styleStrength);

      return new ImageData(new Uint8ClampedArray(pixelData), modelWidth, modelHeight);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error(e);
        setStatus(`Error: ${e.message}`);
      } else {
        console.error(e);
        setStatus(`Error: An unknown error occurred`);
      }
    }
  }, [createSession, selectedModelId, styleStrength, models, setStatus]);

  const handleStyleChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModelId(event.target.value);
  }, []);

  const handleStrengthChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setStyleStrength(parseFloat(event.target.value));
  }, []);

  return {
    status,
    models,
    selectedModelId,
    styleStrength,
    outputCanvasRef,
    handleStyleChange,
    handleStrengthChange,
    runInferenceOnImage,
    runInferenceOnFrame
  };
}