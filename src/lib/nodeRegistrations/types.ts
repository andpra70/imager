export type NodeCtor = new () => unknown;

export type RegisterNodeTypeFn = (type: string, ctor: NodeCtor) => void;
