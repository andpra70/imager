import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";
export interface ManualNodeCtors { ManualPrepareToolNode: NodeCtor; }
export function registerManualToolNodes(registerNodeType:RegisterNodeTypeFn,ctors:ManualNodeCtors){registerNodeType("tools/manual/prepare",ctors.ManualPrepareToolNode);}
