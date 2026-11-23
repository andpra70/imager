/// <reference types="vite/client" />

interface GPUAdapter {
  readonly info?: {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  };
}
