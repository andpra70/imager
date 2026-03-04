import source from "./p5.marching.js?raw";

type MarchingSquaresFn = (data: number[][], threshold?: number) => number[][];

const RUNTIME_KEY = "__plotterfun_marching_squares__";

function createMarchingSquares() {
  const runtime = globalThis as Record<string, unknown>;
  const cached = runtime[RUNTIME_KEY];
  if (typeof cached === "function") {
    return cached as MarchingSquaresFn;
  }

  class MockP5 {}
  const factory = new Function(
    "p5",
    `${source}
return p5.prototype.marchingSquares;`,
  ) as (p5Ctor: typeof MockP5) => MarchingSquaresFn;

  const marchingSquares = factory(MockP5);
  if (typeof marchingSquares !== "function") {
    throw new Error("p5.marching runtime is not available.");
  }

  runtime[RUNTIME_KEY] = marchingSquares;
  return marchingSquares;
}

const marchingSquaresRuntime = createMarchingSquares();

export type { MarchingSquaresFn };
export default marchingSquaresRuntime;
