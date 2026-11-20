import type { GraphImage } from "../../../../models/graphImage";
import { clamp } from "../shared";
import { kodakPrinterProfiles, type KodakPrintOptions } from "./model";

const MAX_PAYLOAD = 16 << 20;
const SPP_SERVICE = "00001101-0000-1000-8000-00805f9b34fb";

interface SerialPortInfo { bluetoothServiceClassId?: string }
export interface KodakSerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface SerialApi { requestPort(options?: { filters?: Array<{ bluetoothServiceClassId: string }> }): Promise<KodakSerialPort> }
interface Message { command: number; param1?: number; param2?: number; reserved?: number; payload?: Uint8Array }
export type KodakPrintPass = 0 | 1 | 2 | 3;

function serialApi(): SerialApi {
  const serial = (navigator as Navigator & { serial?: SerialApi }).serial;
  if (!serial) throw new Error("Web Serial non disponibile: usa Chrome/Chromium desktop 117+ su HTTPS o localhost.");
  return serial;
}

export async function connectKodakPrinter(log: (line: string) => void): Promise<KodakSerialPort> {
  const port = await serialApi().requestPort({ filters: [{ bluetoothServiceClassId: SPP_SERVICE }] });
  await port.open({ baudRate: 115200, bufferSize: 1 << 20 });
  log(`Porta aperta · servizio ${port.getInfo().bluetoothServiceClassId ?? "seriale"}`);
  return port;
}

export function prepareKodakImage(source: GraphImage, options: KodakPrintOptions): HTMLCanvasElement {
  const profile = kodakPrinterProfiles[options.model];
  const output = document.createElement("canvas");
  output.width = profile.width; output.height = profile.height;
  const context = output.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D non disponibile");
  context.fillStyle = "#fff"; context.fillRect(0, 0, output.width, output.height);
  const baseScale = options.fit
    ? Math.min(output.width / source.width, output.height / source.height)
    : Math.max(output.width / source.width, output.height / source.height);
  const scale = baseScale * (options.fit ? 1 : clamp(options.cropZoom, 1, 4));
  const width = source.width * scale, height = source.height * scale;
  const overflowX = Math.max(0, (width - output.width) / 2);
  const overflowY = Math.max(0, (height - output.height) / 2);
  const drawX = (output.width - width) / 2 + (options.fit ? 0 : clamp(options.cropPanX, -1, 1) * overflowX);
  const drawY = (output.height - height) / 2 + (options.fit ? 0 : clamp(options.cropPanY, -1, 1) * overflowY);
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.drawImage(source, drawX, drawY, width, height);
  if (options.saturation !== 1 || options.brightness !== 1 || options.contrast !== 1) {
    const image = context.getImageData(0, 0, output.width, output.height), pixels = image.data;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      let red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
      if (red === 255 && green === 255 && blue === 255) continue;
      red = (red * options.brightness - 127.5) * options.contrast + 127.5;
      green = (green * options.brightness - 127.5) * options.contrast + 127.5;
      blue = (blue * options.brightness - 127.5) * options.contrast + 127.5;
      const luminance = .2126 * red + .7152 * green + .0722 * blue;
      pixels[offset] = clamp(Math.round(luminance + (red - luminance) * options.saturation), 0, 255);
      pixels[offset + 1] = clamp(Math.round(luminance + (green - luminance) * options.saturation), 0, 255);
      pixels[offset + 2] = clamp(Math.round(luminance + (blue - luminance) * options.saturation), 0, 255);
    }
    context.putImageData(image, 0, 0);
  }
  return output;
}

export async function encodeKodakJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    value => value ? resolve(value) : reject(new Error("Codifica JPEG fallita")), "image/jpeg", clamp(quality, .5, 1),
  ));
  return new Uint8Array(await blob.arrayBuffer());
}

function encode(message: Message) {
  const payload = message.payload ?? new Uint8Array(), bytes = new Uint8Array(8 + payload.length);
  bytes[0] = message.command; bytes[1] = message.param1 ?? 0; bytes[2] = message.param2 ?? 0; bytes[3] = message.reserved ?? 0;
  new DataView(bytes.buffer).setUint32(4, payload.length, false); bytes.set(payload, 8); return bytes;
}
class ByteReader {
  private chunks: Uint8Array[] = []; private available = 0;
  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {}
  async exact(length: number) {
    while (this.available < length) { const result = await this.reader.read(); if (result.done) throw new Error("La stampante ha chiuso il collegamento"); if (result.value.length) { this.chunks.push(result.value); this.available += result.value.length; } }
    const output = new Uint8Array(length); let offset = 0;
    while (offset < length) { const chunk = this.chunks[0], count = Math.min(chunk.length, length - offset); output.set(chunk.subarray(0, count), offset); offset += count; this.available -= count; if (count === chunk.length) this.chunks.shift(); else this.chunks[0] = chunk.subarray(count); }
    return output;
  }
}
async function readMessage(reader: ByteReader): Promise<Required<Message>> {
  const header = await reader.exact(8), length = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(4, false);
  if (length > MAX_PAYLOAD) throw new Error(`Payload PPVP troppo grande: ${length}`);
  return { command: header[0], param1: header[1], param2: header[2], reserved: header[3], payload: await reader.exact(length) };
}
function stateError(message: Required<Message>) {
  const details: Record<number, string> = { 1: "Errore generale", 3: "Errore generale", 4: "Carta inceppata", 20: "Cartuccia esaurita/non riconosciuta", 21: "Carta non riconosciuta", 22: "Cartuccia o carta assente", 23: "Cartuccia non riconosciuta", 27: "Errore carta", 28: "Cartuccia esaurita", 40: "Batteria insufficiente", 41: "Batteria quasi scarica", 42: "Temperatura fuori intervallo" };
  return new Error(`${details[message.param2] ?? "Errore stampante"} (PPVP ${message.param1}/${message.param2}/${message.reserved})`);
}

export async function printKodakImage(port: KodakSerialPort, jpeg: Uint8Array, log: (line: string) => void, onProgress: (pass: KodakPrintPass) => void, timeoutMs: number) {
  if (!port.readable || !port.writable) throw new Error("Porta seriale non aperta");
  const serialReader = port.readable.getReader(), serialWriter = port.writable.getWriter(), reader = new ByteReader(serialReader);
  let timedOut = false, started = false, acknowledged = false;
  const timeout = window.setTimeout(() => { timedOut = true; void serialReader.cancel("timeout PPVP"); }, timeoutMs);
  const write = async (message: Message) => { log(`TX cmd=${message.command} p1=${message.param1 ?? 0} p2=${message.param2 ?? 0} bytes=${message.payload?.length ?? 0}`); await serialWriter.write(encode(message)); };
  try {
    await write({ command: 100, param1: 1 });
    while (true) {
      const message = await readMessage(reader); log(`RX cmd=${message.command} p1=${message.param1} p2=${message.param2} bytes=${message.payload.length}`);
      switch (message.command) {
        case 1: if (message.param1 === 5) await write({ command: 7, param1: message.reserved }); else if (message.param2 !== 0) throw new Error(`Comando PPVP ${message.param1} rifiutato: ${message.param2}/${message.reserved}`); break;
        case 2: if (!acknowledged) { await write({ command: 2, param1: 1, param2: 37 }); acknowledged = true; } break;
        case 4:
          if (message.param1 === 1 && !started) { const payload = new Uint8Array(12); new DataView(payload.buffer).setUint32(0, jpeg.length, false); await write({ command: 5, param1: 1, payload }); started = true; }
          else if (message.param1 === 3 && message.payload.length >= 8 && message.payload[7] <= 3) onProgress(message.payload[7] as KodakPrintPass);
          else if (message.param1 === 6) { await write({ command: 1 }); return; }
          else if (message.param1 === 4) throw stateError(message); else if (message.param1 === 5) throw new Error(`Errore stampante non recuperabile: ${message.param2}/${message.reserved}`); break;
        case 8: case 17: { if (message.payload.length < 8) throw new Error("Richiesta dati PPVP incompleta"); const view = new DataView(message.payload.buffer, message.payload.byteOffset, message.payload.byteLength), offset = view.getUint32(0, false), length = view.getUint32(4, false); if (offset + length > jpeg.length) throw new Error(`Range PPVP fuori immagine: ${offset}+${length}/${jpeg.length}`); await write({ command: 9, param1: message.param1, param2: message.param2, payload: jpeg.slice(offset, offset + length) }); break; }
        case 64: case 101: throw new Error(`La stampante ha chiuso la sessione (cmd=${message.command})`);
      }
    }
  } catch (error) { if (timedOut) throw new Error("Timeout in attesa del completamento stampa"); throw error; }
  finally { window.clearTimeout(timeout); serialWriter.releaseLock(); serialReader.releaseLock(); }
}
