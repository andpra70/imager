import type { NodeCtor, RegisterNodeTypeFn } from "../../shared";
import { openCvOperationSpecs } from "./model";
export function registerOpenCvToolNodes(registerNodeType:RegisterNodeTypeFn,ctors:Record<string,NodeCtor>){for(const spec of openCvOperationSpecs)registerNodeType(`tools/opencv/${spec.id}`,ctors[spec.id]);}
