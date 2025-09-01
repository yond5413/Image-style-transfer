import { useState, useRef, useEffect, useCallback } from 'react';
import { InferenceSession, Tensor } from 'onnxruntime-web';
import * as ort from 'onnxruntime-web';
import { drawScaledImageDataToCanvas } from '../lib/utils';

const ALLOWED_FILE_TYPES = ['image/png', 'image/jpeg'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Define shared types for the model manifest
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

export function useImageProcessor() {
  // State for image handling
  const [originalImageBytes, setOriginalImageBytes] = useState<ArrayBuffer | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // State for model and inference
  const [session, setSession] = useState<InferenceSession | null>(null);
  const [sessionCache, setSessionCache] = useState<Record<string, InferenceSession>>({});
  const sessionCacheRef = useRef(sessionCache);
  sessionCacheRef.current = sessionCache;
  const [status, setStatus] = useState("Loading WebAssembly...");
  const [models, setModels] = useState<ModelManifestEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [styleStrength, setStyleStrength] = useState(0.8);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasmRef = useRef<any>(null);
  const [onnxExecutionProviders, setOnnxExecutionProviders] = useState<string[]>(['wasm']);

  // --- Effects ---

  useEffect(() => {
    if ((navigator as any).gpu) {
      setOnnxExecutionProviders(['webgpu', 'wasm']);
    } else {
      setOnnxExecutionProviders(['webgl', 'wasm']);
    }

    async function loadWasm() {
      try {
        setStatus("Loading WebAssembly module...");
        const wasm = await import("../wasm/pkg");
        await wasm.default();
        wasmRef.current = wasm;
        return true;
      } catch (e) {
        console.error("Failed to load WASM module:", e);
        setStatus("Error: Failed to load WebAssembly module. Please refresh.");
        return false;
      }
    }

    async function loadModelManifest() {
      try {
        setStatus("Loading available styles...");
        const manifestResponse = await fetch('/models/manifest.json');
        if (!manifestResponse.ok) {
          throw new Error(`Failed to fetch manifest: ${manifestResponse.statusText}`);
        }
        const manifest: ModelManifest = await manifestResponse.json();
        setModels(manifest.models);
        if (manifest.models.length > 0) {
          setSelectedModelId(manifest.models[0].id);
          setStatus("Select a style and image to start.");
        } else {
          setStatus("No models found in manifest.");
        }
      } catch (e) {
        console.error("Failed to load model manifest:", e);
        setStatus("Error: Could not load model list. Please check your connection.");
      }
    }

    async function initialize() {
      if (await loadWasm()) {
        await loadModelManifest();
      }
    }

    initialize();
  }, []);

  useEffect(() => {
    // Release all ONNX sessions when the component unmounts to prevent memory leaks.
    return () => {
      Object.values(sessionCacheRef.current).forEach(session => {
        if (session) {
          session.release().catch(e => console.error("Error releasing session:", e));
        }
      });
    };
  }, []);

  const runInference = useCallback(async (imageBytes: ArrayBuffer, modelId: string) => {
    if (!wasmRef.current) return;

    try {
      let currentSession = sessionCache[modelId];
      if (!currentSession) {
        const modelData = models.find(m => m.id === modelId);
        if (!modelData) { setStatus(`Model ${modelId} not found`); return; }

        setStatus(`Loading ${modelData.name} model...`);
        const modelFile = modelData.file;
        ort.env.wasm.wasmPaths = '/';
        currentSession = await InferenceSession.create(modelFile, { executionProviders: onnxExecutionProviders });
        
        setStatus(`Warming up ${modelData.name} model...`);
        const { shape } = modelData.input;
        const dummyInput = new Tensor('float32', new Float32Array(shape[1] * shape[2] * shape[3]), shape);
        await currentSession.run({ [currentSession.inputNames[0]]: dummyInput });

        setSessionCache(prev => ({ ...prev, [modelId]: currentSession }));
      }
      setSession(currentSession);

      const modelData = models.find(m => m.id === modelId)!;
      const { shape } = modelData.input;
      const modelHeight = shape[2];
      const modelWidth = shape[3];

      setStatus("Preprocessing...");
      const tensor = wasmRef.current.preprocess(new Uint8Array(imageBytes), modelWidth, modelHeight);

      setStatus("Running inference...");
      const feeds = { [currentSession.inputNames[0]]: new Tensor('float32', tensor, shape) };
      const results = await currentSession.run(feeds);
      const newOutputTensor = results[currentSession.outputNames[0]];

      setStatus("Postprocessing...");
      const pixelData = wasmRef.current.postprocess(newOutputTensor.data, new Uint8Array(imageBytes), modelWidth, modelHeight, styleStrength);

      const outputCanvas = outputCanvasRef.current;
      if (!outputCanvas || !originalCanvasRef.current) return;
      outputCanvas.width = originalCanvasRef.current.width;
      outputCanvas.height = originalCanvasRef.current.height;

      drawScaledImageDataToCanvas(outputCanvas, pixelData, modelWidth, modelHeight);

      setStatus("Done!");
    } catch (e) {
      console.error(e);
      setStatus("Error during inference.");
    }
  }, [sessionCache, models, onnxExecutionProviders, styleStrength]);

  useEffect(() => {
    if (originalImageBytes && selectedModelId) {
      runInference(originalImageBytes, selectedModelId);
    }
  }, [originalImageBytes, selectedModelId, styleStrength, runInference]);

  // --- Event Handlers ---

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setStatus(`Error: Invalid file type. Please upload a PNG or JPEG image.`);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus(`Error: File is too large. Please upload an image smaller than ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) return;

      const imageUrl = URL.createObjectURL(file);
      setOriginalImageBytes(arrayBuffer);
      setOriginalImageUrl(imageUrl);

      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        const canvas = originalCanvasRef.current;
        if (!canvas) return;
        const MAX_CANVAS_SIZE = 480;
        let displayWidth = img.width;
        let displayHeight = img.height;

        if (img.width > MAX_CANVAS_SIZE || img.height > MAX_CANVAS_SIZE) {
          const ratio = Math.min(MAX_CANVAS_SIZE / img.width, MAX_CANVAS_SIZE / img.height);
          displayWidth = Math.floor(img.width * ratio);
          displayHeight = Math.floor(img.height * ratio);
        }

        canvas.width = displayWidth;
        canvas.height = displayHeight;
        canvas.getContext('2d')?.drawImage(img, 0, 0, displayWidth, displayHeight);
      };
    };
    reader.readAsArrayBuffer(file);
  };

  const handleStyleChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModelId(event.target.value);
  }, []);

  const handleStrengthChange = useCallback((value: number[]) => {
    setStyleStrength(value[0]);
  }, []);

  const reset = () => {
    setOriginalImageBytes(null);
    setOriginalImageUrl(null);
    setFileName(null);
    if (originalCanvasRef.current) {
      originalCanvasRef.current.getContext('2d')?.clearRect(0, 0, originalCanvasRef.current.width, originalCanvasRef.current.height);
    }
    if (outputCanvasRef.current) {
      outputCanvasRef.current.getContext('2d')?.clearRect(0, 0, outputCanvasRef.current.width, outputCanvasRef.current.height);
    }
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    if(input) input.value = "";
  };

  return {
    status,
    setStatus,
    models,
    selectedModelId,
    styleStrength,
    fileName,
    originalImageUrl,
    originalCanvasRef,
    outputCanvasRef,
    handleImageUpload,
    handleStyleChange,
    handleStrengthChange,
    reset,
  };
}
