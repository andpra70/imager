import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";
export function registerPrintToolNodes(registerNodeType: RegisterNodeTypeFn, ctors: { KodakPrintToolNode: NodeCtor }) { registerNodeType("tools/print/kodak", ctors.KodakPrintToolNode); }
