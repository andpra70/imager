import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";
export function registerPrintToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: { KodakPrintToolNode: NodeCtor; PdfPrintToolNode: NodeCtor }) { registerNodeType("tools/print/kodak", ctors.KodakPrintToolNode); registerNodeType("tools/print/pdf", ctors.PdfPrintToolNode); }
