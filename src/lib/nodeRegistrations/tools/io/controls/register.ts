import type { RegisterNodeTypeFn } from "../../../shared";
import { RemoteControlsToolNode } from "./node";

export function registerRemoteControlsNode(registerNodeType: RegisterNodeTypeFn) {
  registerNodeType("tools/io/controls", RemoteControlsToolNode);
}
