export * from "./model";
export * from "./runtime";
export * from "./nodes";
export * from "./register";
export * from "./pdf";
import type { NodeCtor } from "../../shared";
import { KodakPrintToolNode, PdfPrintToolNode } from "./nodes";
export function createToolPrintNodeCtors(): { KodakPrintToolNode: NodeCtor; PdfPrintToolNode: NodeCtor } { return { KodakPrintToolNode: KodakPrintToolNode as NodeCtor, PdfPrintToolNode: PdfPrintToolNode as NodeCtor }; }
