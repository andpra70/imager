import type { NodeCtor } from "../../shared";
import { LineGeneratorToolNode } from "./lineGeneratorNode";
import { PatrickToolNode } from "./nodes";
import { StoppelToolNode } from "./stoppelNode";
import { U111166ToolNode } from "./u111166Node";

export interface ToolArtistsNodeCtors {
  LineGeneratorToolNode: NodeCtor;
  PatrickToolNode: NodeCtor;
  StoppelToolNode: NodeCtor;
  U111166ToolNode: NodeCtor;
}

export function createToolArtistsNodeCtors(): ToolArtistsNodeCtors {
  return {
    LineGeneratorToolNode: LineGeneratorToolNode as NodeCtor,
    PatrickToolNode: PatrickToolNode as NodeCtor,
    StoppelToolNode: StoppelToolNode as NodeCtor,
    U111166ToolNode: U111166ToolNode as NodeCtor,
  };
}
