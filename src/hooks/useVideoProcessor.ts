import { useState, useRef, useEffect, useCallback, RefObject } from 'react';
import { InferenceSession, Tensor } from 'onnxruntime-web';
import * as ort from 'onnxruntime-web';

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

export function useVideoProcessor() {
  // State for model and inference
  const [session, setSession] = useState<InferenceSession | null>(null);
  const sessionRef = useRef<InferenceSession | null>(null);
  const [sessionCache, setSessionCache] = useState<Record<string, InferenceSession>>({});
  const [status, setStatus] = useState("Loading WebAssembly...");
  const [models, setModels] = useState<ModelManifestEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [styleStrength, setStyleStrength] = useState(0.8);
  const strengthRef = useRef(styleStrength);
  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasmRef = useRef<any>(null);
  const [onnxExecutionProviders, setOnnxExecutionProviders] = useState<string[]>(['wasm']);
  const [isModelLoading, setIsModelLoading] = useState(false);

  // State for webcam handling
  const [isVideoRunning, setIsVideoRunning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const requestRef = useRef<number>();

  // --- Effects ---

  useEffect(() => {
    if ((navigator as any).gpu) {
      setOnnxExecutionProviders(['webgpu', 'wasm']);
    } else {
      setOnnxExecutionProviders(['webgl', 'wasm']);
    }

    async function loadWasmAndModels() {
      try {
        const wasm = await import("../wasm/pkg");
        await wasm.default();
        wasmRef.current = wasm;
        setStatus("Select a style and start the webcam.");

        const manifestResponse = await fetch('/models/manifest.json');
        const manifest: ModelManifest = await manifestResponse.json();
        setModels(manifest.models);
        if (manifest.models.length > 0) {
          setSelectedModelId(manifest.models[0].id);
        }
      } catch (e) {
        console.error(e);
        setStatus("Failed to load session.");
      }
    }
    loadWasmAndModels();
  }, []);

  const createSession = useCallback(async (modelId: string) => {
    let currentSession = sessionCache[modelId];
    if (currentSession) {
      if (session !== currentSession) setSession(currentSession);
      return currentSession;
    }

    setIsModelLoading(true);
    const modelData = models.find(m => m.id === modelId);
    if (!modelData) {
      setStatus(`Model ${modelId} not found`);
      setIsModelLoading(false);
      return null;
    }

    setStatus(`Loading ${modelData.name} model...`);
    try {
      const modelFile = modelData.file;
      ort.env.wasm.wasmPaths = '/';
      currentSession = await InferenceSession.create(modelFile, { executionProviders: onnxExecutionProviders });
      setSessionCache(prev => ({ ...prev, [modelId]: currentSession }));
      setSession(currentSession);
      setStatus(`Model ${modelData.name} loaded`);
    } catch (e) {
      console.error("Failed to create session", e);
      setStatus("Failed to load model.");
    } finally {
      setIsModelLoading(false);
    }
    return currentSession;
  }, [models, session, sessionCache, onnxExecutionProviders]);

  useEffect(() => {
    if (selectedModelId) {
      createSession(selectedModelId);
    }
  }, [selectedModelId, createSession]);

  useEffect(() => {
    strengthRef.current = styleStrength;
  }, [styleStrength]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const runInferenceOnFrame = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!wasmRef.current || !selectedModelId || !sessionRef.current) return;

    try {
      const modelData = models.find(m => m.id === selectedModelId)!;
      const { shape } = modelData.input;
      const modelHeight = shape[2];
      const modelWidth = shape[3];

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const framePixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      const tensor = wasmRef.current.preprocess_frame(new Uint8Array(framePixelData), canvas.width, canvas.height, modelWidth, modelHeight);
      const feeds = { [sessionRef.current.inputNames[0]]: new Tensor('float32', tensor, shape) };
      const results = await sessionRef.current.run(feeds);
      const newOutputTensor = results[sessionRef.current.outputNames[0]];

      const pixelData = wasmRef.current.postprocess_frame(newOutputTensor.data, modelWidth, modelHeight);
      return new ImageData(new Uint8ClampedArray(pixelData), modelWidth, modelHeight);
    } catch (e) {
      console.error(e);
      setStatus("Error during inference.");
    }
  }, [selectedModelId, models]);

  const videoLoop = useCallback(async () => {
    if (videoRef.current && videoRef.current.readyState >= 3 && outputCanvasRef.current) {
      const outputCtx = outputCanvasRef.current.getContext('2d');
      const videoElement = videoRef.current;
      const outputCanvas = outputCanvasRef.current;

      if (outputCtx) {
        // When loading a new model, just show the raw webcam feed.
        if (isModelLoading) {
          outputCtx.drawImage(videoElement, 0, 0, outputCanvas.width, outputCanvas.height);
        } else {
          // 1. Create a temporary canvas to get the current frame's pixel data
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = videoElement.videoWidth;
          tempCanvas.height = videoElement.videoHeight;
          const tempCtx = tempCanvas.getContext('2d');
          if (!tempCtx) return;
          tempCtx.drawImage(videoElement, 0, 0, tempCanvas.width, tempCanvas.height);

          // 2. Run inference to get the stylized frame
          const stylizedImageData = await runInferenceOnFrame(tempCanvas);

          if (stylizedImageData) {
            // 3. Draw the original webcam frame to the output canvas
            outputCtx.globalAlpha = 1.0;
            outputCtx.drawImage(videoElement, 0, 0, outputCanvas.width, outputCanvas.height);

            // 4. Create another temporary canvas for the stylized image
            const stylizedCanvas = document.createElement('canvas');
            stylizedCanvas.width = stylizedImageData.width;
            stylizedCanvas.height = stylizedImageData.height;
            stylizedCanvas.getContext('2d')?.putImageData(stylizedImageData, 0, 0);

            // 5. Draw the stylized image on top with alpha for blending
            outputCtx.globalAlpha = strengthRef.current;
            outputCtx.drawImage(stylizedCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
            
            // 6. Reset alpha
            outputCtx.globalAlpha = 1.0;
          } else {
            // Fallback to drawing the normal video if inference fails
            outputCtx.drawImage(videoElement, 0, 0, outputCanvas.width, outputCanvas.height);
          }
        }
      }
    }
    requestRef.current = requestAnimationFrame(videoLoop);
  }, [isModelLoading, runInferenceOnFrame]);

  // --- Event Handlers ---

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
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    setIsVideoRunning(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleStyleChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedModelId(event.target.value);
  }, []);

  const handleStrengthChange = useCallback((value: number[]) => {
    setStyleStrength(value[0]);
  }, []);

  return {
    status,
    models,
    selectedModelId,
    styleStrength,
    isVideoRunning,
    videoRef,
    outputCanvasRef,
    startWebcam,
    stopWebcam,
    handleStyleChange,
    handleStrengthChange,
  };
}
