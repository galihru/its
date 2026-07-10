import {
  runBrowserRfDetrImageData,
  type BrowserRfDetrResult,
  type BrowserRfDetrRunOptions,
} from "./browserRfDetr";

type WorkerRequest = {
  id: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
  options: BrowserRfDetrRunOptions;
};

type WorkerResponse = {
  id: number;
  result?: BrowserRfDetrResult;
  error?: string;
};

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const { id, width, height, pixels, options } = event.data;
  const response: WorkerResponse = { id };
  try {
    const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
    response.result = await runBrowserRfDetrImageData(imageData, {
      ...options,
      worker: false,
      includeThumbnails: false,
    });
  } catch (error) {
    response.error = error instanceof Error ? error.message : "Worker RF-DETR gagal";
  }
  self.postMessage(response);
});
