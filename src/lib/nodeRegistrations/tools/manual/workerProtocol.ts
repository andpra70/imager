import type { ManualStageProgress, ManualWorkerInput, ManualWorkerResult } from "./model";

export type ManualWorkerRequest = { type: "prepare"; jobId: number; input: ManualWorkerInput };
export type ManualWorkerResponse =
  | { type: "progress"; jobId: number; progress: ManualStageProgress }
  | { type: "result"; jobId: number; result: ManualWorkerResult }
  | { type: "error"; jobId: number; message: string };
