(function () {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function hash(x, y) {
    let value = (x * 374761393 + y * 668265263) >>> 0;
    value = (value ^ (value >>> 13)) >>> 0;
    value = Math.imul(value, 1274126177) >>> 0;
    return (value ^ (value >>> 16)) >>> 0;
  }

  function generateBlueNoiseTable(size) {
    const raw = new Float32Array(size * size);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        raw[y * size + x] = hash(x, y) / 0xffffffff;
      }
    }

    const filtered = new Float32Array(size * size);
    let minValue = Infinity;
    let maxValue = -Infinity;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const center = raw[y * size + x];
        const left = raw[y * size + ((x - 1 + size) % size)];
        const right = raw[y * size + ((x + 1) % size)];
        const up = raw[((y - 1 + size) % size) * size + x];
        const down = raw[((y + 1) % size) * size + x];
        const value = center * 4 - left - right - up - down;
        filtered[y * size + x] = value;
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }
    }

    const normalized = new Int16Array(size * size);
    const range = maxValue - minValue || 1;
    for (let index = 0; index < filtered.length; index += 1) {
      normalized[index] = Math.round(((filtered[index] - minValue) / range) * 255 - 128);
    }

    return normalized;
  }

  class BlueNoise {
    constructor(options) {
      this.weight = options?.weight ?? 1;
    }

    diffuse(pixel, palettePixel, strength, x, y) {
      const index = ((y & 63) << 6) | (x & 63);
      const noise = (globalThis.TELL_BLUE_NOISE[index] ?? 0) / 128;
      const factor = this.weight * strength * noise;

      const r = pixel & 0xff;
      const g = (pixel >>> 8) & 0xff;
      const b = (pixel >>> 16) & 0xff;
      const a = (pixel >>> 24) & 0xff;

      const r2 = palettePixel & 0xff;
      const g2 = (palettePixel >>> 8) & 0xff;
      const b2 = (palettePixel >>> 16) & 0xff;
      const a2 = (palettePixel >>> 24) & 0xff;

      const rr = clamp(Math.round(r + (r - r2) * factor), 0, 255);
      const gg = clamp(Math.round(g + (g - g2) * factor), 0, 255);
      const bb = clamp(Math.round(b + (b - b2) * factor), 0, 255);
      const aa = clamp(Math.round(a + (a - a2) * factor), 0, 255);

      return (aa << 24) | (bb << 16) | (gg << 8) | rr;
    }
  }

  globalThis.TELL_BLUE_NOISE = generateBlueNoiseTable(64);
  globalThis.BlueNoise = BlueNoise;
}).call(globalThis);
