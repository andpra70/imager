export * from "./model";
export * from "./runtime";
export * from "./nodes";
export * from "./register";
export * from "./pdf";
import type { NodeCtor } from "../../shared";
import { KodakPrintToolNode, PdfPrintToolNode, Pdf2SvgToolNode, ShowPdfToolNode } from "./nodes";
export function createToolPrintNodeCtors(): { KodakPrintToolNode: NodeCtor; PdfPrintToolNode: NodeCtor; Pdf2SvgToolNode: NodeCtor; ShowPdfToolNode: NodeCtor } { return { KodakPrintToolNode: KodakPrintToolNode as NodeCtor, PdfPrintToolNode: PdfPrintToolNode as NodeCtor, Pdf2SvgToolNode: Pdf2SvgToolNode as NodeCtor, ShowPdfToolNode: ShowPdfToolNode as NodeCtor }; }
