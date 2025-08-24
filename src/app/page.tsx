"use client";

import { useState, useRef, useEffect } from 'react';
import { InferenceSession, Tensor } from 'onnxruntime-web';
import * as ort from 'onnxruntime-web';

export default function Home() {
  const [session, setSession] = useState<InferenceSession | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState("Not loaded");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wasmRef = useRef<any>(null);

  useEffect(() => {
    if (!(navigator as any).gpu) {
      console.error("WebGPU not supported on this browser!");
      setStatus("WebGPU not supported!");
      return;
    }

    async function loadWasm() {
      try {
        const wasm = await import("../wasm/pkg");
        await wasm.default();
        wasmRef.current = wasm;
        setStatus("WASM loaded");
      } catch (e) {
        console.error(e);
        setStatus("Failed to load WASM");
      }
    }
    loadWasm();
  }, []);

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      if (!arrayBuffer) return;

      const imageUrl = URL.createObjectURL(file);
      setImage(imageUrl);

      runInference(arrayBuffer);
    };
    reader.readAsArrayBuffer(file);
  }

  async function runInference(imageBytes: ArrayBuffer) {
    if (!wasmRef.current) {
      setStatus("WASM not loaded yet");
      return;
    }

    setStatus("Loading model...");
    ort.env.wasm.wasmPaths = '/';
    const session = await InferenceSession.create('./models/candy.onnx', { executionProviders: ['webgpu', 'wasm'] });
    setSession(session);
    setStatus("Model loaded");

    const image = new Image();
    image.src = URL.createObjectURL(new Blob([imageBytes]));
    image.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, image.width, image.height);

      setStatus("Preprocessing...");
      const tensor = wasmRef.current.preprocess(new Uint8Array(imageBytes), 224, 224);

      setStatus("Running inference...");
      const inputName = session.inputNames[0];
      const feeds = { [inputName]: new Tensor('float32', tensor, [1, 3, 224, 224]) };
      const results = await session.run(feeds);
      console.log(results);

      setStatus("Postprocessing...");
      const outputRgba = wasmRef.current.postprocess(results.output.data, new Uint8Array(imageBytes), image.width, image.height, 0.8);

      setStatus("Done!");
      const outputCanvas = canvasRef.current;
      if (!outputCanvas) return;
      outputCanvas.width = image.width;
      outputCanvas.height = image.height;
      const outputCtx = outputCanvas.getContext('2d');
      if (!outputCtx) return;
      outputCtx.putImageData(new ImageData(new Uint8ClampedArray(outputRgba), image.width, image.height), 0, 0);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Status: {status}
        </p>
      </div>

      <div className="relative flex place-items-center">
        <input type="file" onChange={handleImageUpload} />
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left">
        <canvas ref={canvasRef}></canvas>
      </div>
    </main>
  )
}
