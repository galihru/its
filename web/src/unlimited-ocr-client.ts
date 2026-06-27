/**
 * Compatibility shim for older imports.
 *
 * This module intentionally does not call an OCR endpoint. OCR is performed
 * with Transformers.js in the browser, without API keys or paid inference.
 */

export type UnlimitedOcrOptions = {
  model?: string;
  prompt?: string;
  timeoutMs?: number;
};

type LocalOcrPipeline = ((input: string, options?: Record<string, unknown>) => Promise<unknown>) & {
  dispose?: () => void | Promise<void>;
};

let pipelinePromise: Promise<LocalOcrPipeline> | null = null;

function normalizeOutput(output: unknown): string {
  const first = Array.isArray(output) ? output[0] : output;
  if (!first || typeof first !== "object") return "";
  const text = (first as Record<string, unknown>).generated_text;
  return typeof text === "string" ? text.trim() : "";
}

async function localOcrPipeline(model = "Xenova/trocr-small-printed"): Promise<LocalOcrPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const mod = await import("@huggingface/transformers");
      mod.env.allowRemoteModels = true;
      mod.env.allowLocalModels = true;
      mod.env.useBrowserCache = true;
      return await mod.pipeline("image-to-text", model, { dtype: "q8" }) as unknown as LocalOcrPipeline;
    })();
  }
  return pipelinePromise;
}

export async function runUnlimitedOcrOnImages(imageDataUrls: string[], options: UnlimitedOcrOptions = {}): Promise<string> {
  const images = imageDataUrls.filter((src) => /^data:image\//i.test(src)).slice(0, 4);
  if (!images.length) return "";
  const ocr = await localOcrPipeline(options.model);
  const texts: string[] = [];
  for (const image of images) {
    const text = normalizeOutput(await ocr(image, { max_new_tokens: 80 }));
    if (text) texts.push(text);
  }
  return texts.join("\n").trim();
}
