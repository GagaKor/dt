declare module 'gltf-validator' {
  export function validateBytes(data: Uint8Array): Promise<{ issues: { numErrors: number } }>;
}
