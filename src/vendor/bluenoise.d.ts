declare global {
  var TELL_BLUE_NOISE: Int16Array;
  var BlueNoise: new (options: { weight: number }) => {
    diffuse: (
      pixel: number,
      palettePixel: number,
      strength: number,
      x: number,
      y: number,
    ) => number;
  };
}

export {};
