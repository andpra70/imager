import { drawSourceToCanvas } from "../../../../imageUtils";
import type { FooocusProgress, FooocusRequest, FooocusResult } from "./model";

const CACHE_NAME = "plotterfun-fooocus-gradio-v1";
const CACHE_ORIGIN = "https://plotterfun-fooocus-cache.invalid";

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Impossibile codificare l'immagine.")), "image/png",
  ));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Codifica immagine Fooocus fallita."));
    reader.onerror = () => reject(reader.error ?? new Error("Codifica immagine Fooocus fallita."));
    reader.readAsDataURL(blob);
  });
}

function blobToCanvas(blob: Blob) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob); const image = new Image();
    image.onload = () => { try { resolve(drawSourceToCanvas(image)); } finally { URL.revokeObjectURL(url); } };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Fooocus ha restituito un'immagine non valida.")); };
    image.src = url;
  });
}

async function hash(parts: Array<string | Blob>) {
  const buffers = await Promise.all(parts.map(async (part) => typeof part === "string"
    ? new TextEncoder().encode(part) : new Uint8Array(await part.arrayBuffer())));
  const merged = new Uint8Array(buffers.reduce((sum, value) => sum + value.byteLength, 0));
  let offset = 0; buffers.forEach((value) => { merged.set(value, offset); offset += value.byteLength; });
  const digest = await crypto.subtle.digest("SHA-256", merged);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function prop(component: { props?: Record<string, unknown> } | undefined, key: string) { return component?.props?.[key]; }

function choiceValues(component: { props?: Record<string, unknown> } | undefined) {
  const choices = prop(component, "choices");
  if (!Array.isArray(choices)) return [];
  return choices.map((choice) => Array.isArray(choice) ? String(choice[1] ?? choice[0]) : String(choice));
}

export async function fetchFooocusBaseModels(baseUrl: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/config`);
  if (!response.ok) throw new Error(`Modelli Fooocus non disponibili (${response.status}).`);
  const config = await response.json() as FooocusGradioClient["config"];
  const component = config.components.find((item) => prop(item, "label") === "Base Model (SDXL only)");
  return choiceValues(component);
}

export async function fetchFooocusLoraModels(baseUrl: string) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/config`);
  if (!response.ok) throw new Error(`LoRA Fooocus non disponibili (${response.status}).`);
  const config = await response.json() as FooocusGradioClient["config"];
  const component = config.components.find((item) => /^LoRA 1$/i.test(String(prop(item, "label") ?? "")));
  return choiceValues(component);
}

function findImageUrls(value: unknown): string[] {
  if (typeof value === "string" && (/^data:image\//i.test(value) || /\.(png|jpe?g|webp)(\?|$)/i.test(value))) return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => findImageUrls(item));
  }
  const record = value as Record<string, unknown>;
  // Gradio 3.x normalizza i FileData legacy in { name, data, is_file }:
  // `data` contiene l'URL /file= scaricabile, mentre `name` è il path locale
  // sul processo Fooocus. Preferire sempre data evita di costruire /tmp/... come URL.
  const direct = ["data", "url", "image", "path", "name"].flatMap((key) => findImageUrls(record[key]));
  if (direct.length) return direct;
  return Object.values(record).flatMap((nested) => findImageUrls(nested));
}

interface FooocusGradioClient {
  config: { components: Array<{ id: number; type?: string; props?: Record<string, unknown> }>; dependencies: Array<{ id?: number; api_name?: string | null; backend_fn?: boolean; trigger?: string; trigger_after?: number | null; targets?: number[]; inputs: number[]; outputs: number[]; types?: { generator?: boolean } }> };
  submit: (endpoint: number, data: unknown[]) => {
    on: (type: "data" | "status", callback: (event: { data?: unknown[]; stage?: string; message?: string; code?: string; progress_data?: Array<{ progress?: number | null; desc?: string | null }> }) => void) => unknown;
    destroy: () => void;
  };
}

async function connectFooocus(baseUrl: string): Promise<FooocusGradioClient> {
  const root = baseUrl.replace(/\/$/, "");
  const response = await fetch(`${root}/config`);
  if (!response.ok) throw new Error(`Configurazione Fooocus non disponibile (${response.status}).`);
  const config = await response.json() as FooocusGradioClient["config"];
  const sessionHash = Math.random().toString(36).slice(2);
  return {
    config,
    submit(endpoint, data) {
      const listeners: Record<"data" | "status", Array<(event: never) => void>> = { data: [], status: [] };
      const socketUrl = new URL(`${root}/queue/join`);
      socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(socketUrl);
      const emit = (type: "data" | "status", event: unknown) => listeners[type].forEach((listener) => listener(event as never));
      socket.onerror = () => emit("status", { stage: "error", message: "Connessione WebSocket a Fooocus fallita." });
      socket.onclose = (event) => {
        if (!event.wasClean) emit("status", { stage: "error", message: "Connessione Fooocus interrotta." });
      };
      socket.onmessage = ({ data: message }) => {
        const event = JSON.parse(String(message)) as { msg?: string; output?: { data?: unknown[]; error?: string; average_duration?: number }; success?: boolean; progress_data?: Array<{ progress?: number | null; desc?: string | null }> };
        if (event.msg === "send_hash") socket.send(JSON.stringify({ fn_index: endpoint, session_hash: sessionHash }));
        else if (event.msg === "send_data") socket.send(JSON.stringify({ data, event_data: null, fn_index: endpoint, session_hash: sessionHash }));
        else if (event.msg === "estimation") emit("status", { stage: "pending", message: "in coda" });
        else if (event.msg === "process_starts") emit("status", { stage: "generating", message: "elaborazione" });
        else if (event.msg === "process_generating") {
          if (event.output?.data) emit("data", { data: event.output.data });
          emit("status", { stage: "generating", message: event.output?.error, progress_data: event.progress_data });
        } else if (event.msg === "process_completed") {
          if (event.output?.data) emit("data", { data: event.output.data });
          emit("status", event.success === false || event.output?.error
            ? { stage: "error", message: event.output?.error || "Errore Fooocus." }
            : { stage: "complete", progress_data: event.progress_data });
          socket.close();
        }
      };
      return {
        on(type, callback) { listeners[type].push(callback as never); return this; },
        destroy() { if (socket.readyState < WebSocket.CLOSING) socket.close(); },
      };
    },
  };
}

function findDependency(config: FooocusGradioClient["config"], name: string) {
  return config.dependencies.find((dependency) => dependency.api_name === name || dependency.api_name === `/${name}`);
}

function buildTaskArguments(client: FooocusGradioClient, image: string, request: FooocusRequest, inputIds: number[], state: Map<number, unknown>) {
  const components = new Map((client.config?.components ?? []).map((component) => [component.id, component]));
  const values = inputIds.map((id) => state.has(id) ? state.get(id) : prop(components.get(id), "value") ?? null);
  const labels = inputIds.map((id) => String(prop(components.get(id), "label") ?? ""));
  const elemIds = inputIds.map((id) => String(prop(components.get(id), "elem_id") ?? ""));
  const promptIndex = elemIds.findIndex((id) => id === "positive_prompt");
  const negativeIndex = labels.findIndex((label) => label === "Negative Prompt");
  const stylesIndex = labels.findIndex((label) => label === "Selected Styles");
  const inputEnabledIndex = labels.findIndex((label) => label === "Input Image");
  const imageNumberIndex = labels.findIndex((label) => label === "Image Number");
  const performanceIndex = labels.findIndex((label) => label === "Performance");
  const baseModelIndex = labels.findIndex((label) => label === "Base Model (SDXL only)");
  if (promptIndex < 0 || negativeIndex < 0) throw new Error("Configurazione Fooocus non riconosciuta: prompt non trovato.");
  values[promptIndex] = request.options.prompt; values[negativeIndex] = request.options.negativePrompt;
  if (stylesIndex >= 0) {
    const styles = Array.isArray(values[stylesIndex]) ? values[stylesIndex].map(String) : [];
    values[stylesIndex] = request.options.promptExpansion
      ? Array.from(new Set(["Fooocus V2", ...styles]))
      : styles.filter((style) => style !== "Fooocus V2");
  }
  if (inputEnabledIndex >= 0) values[inputEnabledIndex] = true;
  if (imageNumberIndex >= 0) values[imageNumberIndex] = 1;
  if (performanceIndex >= 0) {
    const available = choiceValues(components.get(inputIds[performanceIndex]));
    const fastest = ["Lightning", "Hyper-SD", "Extreme Speed", "Speed"].find((mode) => available.includes(mode));
    if (fastest) values[performanceIndex] = fastest;
  }
  if (baseModelIndex >= 0 && request.options.baseModel) {
    const available = choiceValues(components.get(inputIds[baseModelIndex]));
    if (available.includes(request.options.baseModel)) values[baseModelIndex] = request.options.baseModel;
  }
  let loraSlot = 0;
  for (let index = 0; index <= labels.length - 3 && loraSlot < request.options.loras.length; index += 1) {
    if (labels[index] !== "Enable" || !/^LoRA \d+$/.test(labels[index + 1]) || labels[index + 2] !== "Weight") continue;
    const lora = request.options.loras[loraSlot++];
    const available = choiceValues(components.get(inputIds[index + 1]));
    values[index] = lora.enabled && lora.model !== "None";
    values[index + 1] = available.includes(lora.model) ? lora.model : "None";
    values[index + 2] = lora.weight;
    index += 2;
  }
  const currentTabIndex = inputIds.findIndex((id) => {
    const component = components.get(id);
    return component?.type === "textbox" && prop(component, "visible") === false && prop(component, "value") === "uov";
  });
  if (currentTabIndex >= 0) values[currentTabIndex] = "ip";
  for (let index = 0; index <= labels.length - 4; index += 1) {
    if (labels[index] === "Image" && labels[index + 1] === "Stop At" && labels[index + 2] === "Weight" && labels[index + 3] === "Type") {
      values[index] = image; values[index + 1] = request.options.stop;
      values[index + 2] = request.options.weight; values[index + 3] = "ImagePrompt";
      return values;
    }
  }
  throw new Error("Configurazione Fooocus non riconosciuta: controlli ImagePrompt non trovati.");
}

async function fetchFooocusImage(baseUrl: string, imageUrl: string) {
  const root = baseUrl.replace(/\/$/, "");
  let resolvedUrl = imageUrl;
  if (!/^(data:|blob:|https?:\/\/)/i.test(imageUrl)) {
    if (/^\/?file=/.test(imageUrl)) resolvedUrl = `${root}/${imageUrl.replace(/^\//, "")}`;
    else if (/^(\/|[A-Za-z]:[\\/])/.test(imageUrl)) resolvedUrl = `${root}/file=${imageUrl}`;
    else resolvedUrl = new URL(imageUrl, `${root}/`).toString();
  }
  const response = await fetch(resolvedUrl);
  if (!response.ok) throw new Error(`Download risultato Fooocus fallito (${response.status}).`);
  return response.blob();
}

async function runGradioFooocus(request: FooocusRequest, inputBlob: Blob, onProgress?: (progress: FooocusProgress) => void) {
  const client = await connectFooocus(request.options.baseUrl);
  {
    const config = client.config;
    if (!config) throw new Error("Fooocus non espone la configurazione Gradio.");
    const namedGetTask = findDependency(config, "get_task");
    const namedGenerate = findDependency(config, "generate_clicked");
    const generate = namedGenerate ?? config.dependencies.find((dependency) =>
      dependency.backend_fn && dependency.types?.generator === true && dependency.outputs.some((id) => config.components.find((component) => component.id === id)?.type === "gallery"));
    const getTask = namedGetTask ?? (generate?.trigger_after == null ? undefined : config.dependencies[generate.trigger_after]);
    if (!getTask || !generate) throw new Error("Catena di generazione Fooocus non trovata nella configurazione Gradio.");
    const getTaskIndex = getTask.id ?? config.dependencies.indexOf(getTask);
    const generateIndex = generate.id ?? config.dependencies.indexOf(generate);
    const inputDataUrl = await blobToDataUrl(inputBlob);
    const state = new Map<number, unknown>();
    const preparation: number[] = [];
    let predecessor = getTask.trigger_after;
    while (predecessor != null && predecessor >= 0) {
      preparation.unshift(predecessor);
      predecessor = config.dependencies[predecessor]?.trigger_after;
    }
    for (const dependencyIndex of preparation) {
      const dependency = config.dependencies[dependencyIndex];
      if (!dependency?.backend_fn) continue;
      const input = dependency.inputs.map((id) => state.has(id) ? state.get(id) : prop(config.components.find((component) => component.id === id), "value") ?? null);
      const output = await runLegacyPrediction(client, dependencyIndex, input, (event) => {
        if (event.kind === "status") onProgress?.({ progress: event.progress, status: `API ${dependencyIndex}: ${event.status}` });
      });
      dependency.outputs.forEach((id, index) => state.set(id, output[index]));
    }
    const taskOutput = await runLegacyPrediction(client, getTaskIndex, buildTaskArguments(client, inputDataUrl, request, getTask.inputs, state), (event) => {
      if (event.kind === "status") onProgress?.({ progress: event.progress, status: `Task ${getTaskIndex}: ${event.status}` });
    });
    getTask.outputs.forEach((id, index) => state.set(id, taskOutput[index]));
    let previewToken = 0;
    let lastImageUrls: string[] = [];
    const result = await runLegacyPrediction(client, generateIndex, generate.inputs.map((id) => state.get(id) ?? null), (event) => {
      if (event.kind === "status") {
        onProgress?.({ progress: event.progress, status: event.status });
        return;
      }
      const urls = findImageUrls(event.data);
      if (urls.length) lastImageUrls = urls;
      const candidate = urls.length ? urls[urls.length - 1] : null;
      if (!candidate) return;
      const token = ++previewToken;
      void fetchFooocusImage(request.options.baseUrl, candidate)
        .then(blobToCanvas)
        .then((image) => { if (token === previewToken) onProgress?.({ progress: event.progress, status: "preview Fooocus", image }); })
        .catch(() => undefined);
    });
    const resultUrls = findImageUrls(result);
    if (resultUrls.length) lastImageUrls = resultUrls;
    const imageUrl = lastImageUrls.length ? lastImageUrls[lastImageUrls.length - 1] : null;
    if (!imageUrl) {
      console.error("Fooocus: output endpoint generatore senza immagini", result);
      throw new Error("Fooocus ha generato il task, ma la gallery API non ha restituito il file. Controlla la console del browser.");
    }
    onProgress?.({ progress: 1, status: "download immagine Fooocus" });
    return fetchFooocusImage(request.options.baseUrl, imageUrl);
  }
}

type LegacyProgressEvent =
  | { kind: "data"; data: unknown[]; progress: number | null }
  | { kind: "status"; status: string; progress: number | null };

function runLegacyPrediction(client: FooocusGradioClient, endpoint: number, data: unknown[], onProgress?: (event: LegacyProgressEvent) => void) {
  return new Promise<unknown[]>((resolve, reject) => {
    let latest: unknown[] = [];
    const job = client.submit(endpoint, data);
    let progress: number | null = null;
    job.on("data", (event) => { latest = event.data ?? []; onProgress?.({ kind: "data", data: latest, progress }); });
    job.on("status", (event) => {
      const progressItem = event.progress_data?.find((item) => typeof item.progress === "number");
      if (typeof progressItem?.progress === "number") progress = progressItem.progress;
      const status = progressItem?.desc || event.message || (event.stage === "pending" ? "in coda" : event.stage === "generating" ? "generazione" : String(event.stage ?? "Fooocus"));
      onProgress?.({ kind: "status", status, progress });
      if (event.stage === "complete") { job.destroy(); resolve(latest); }
      if (event.stage === "error") { job.destroy(); reject(new Error(event.message || event.code || "Errore Gradio/Fooocus.")); }
    });
  });
}

export async function transformWithFooocus(request: FooocusRequest, onProgress?: (progress: FooocusProgress) => void): Promise<FooocusResult> {
  const inputBlob = await canvasToBlob(request.image);
  const cacheKey = await hash([JSON.stringify(request.options), inputBlob]);
  const cacheUrl = `${CACHE_ORIGIN}/output/${cacheKey}`;
  if ("caches" in globalThis) {
    const cached = await (await caches.open(CACHE_NAME)).match(cacheUrl);
    if (cached) return { image: await blobToCanvas(await cached.blob()), cacheHit: true, seed: null };
  }
  let outputBlob: Blob;
  try { outputBlob = await runGradioFooocus(request, inputBlob, onProgress); }
  catch (error) {
    if (error instanceof TypeError && /fetch|network|connect/i.test(error.message)) {
      throw new Error("Fooocus non raggiungibile. Avvialo su 127.0.0.1:7865 e consenti l'accesso locale.");
    }
    throw error;
  }
  if ("caches" in globalThis) await (await caches.open(CACHE_NAME)).put(cacheUrl, new Response(outputBlob, { headers: { "Content-Type": outputBlob.type } }));
  return { image: await blobToCanvas(outputBlob), cacheHit: false, seed: null };
}
